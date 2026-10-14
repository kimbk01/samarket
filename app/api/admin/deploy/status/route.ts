import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  getOrCreatePromotionRecord,
  hydratePromotionRecordFromLedger,
  invalidateVerifiedIfShaChanged,
  listEvidenceForSha,
  listPromotionHistory,
  listRecentDeployPromotionRecords,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import {
  DEPLOY_PROMOTE_LAYERS_PHASE1,
  readRuntimeGitSha,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  DEPLOY_GATE_CATALOG,
  evaluateRequiredGates,
  normalizeImpactScope,
} from "@/lib/admin/deploy-promotion/deploy-evidence-gates";
import {
  deployOwnerIdsConfigured,
  isDeployOwnerUserId,
} from "@/lib/admin/deploy-promotion/deploy-owner";
import {
  evaluateProductionPromoteExecution,
  evaluateProductionRollbackExecution,
} from "@/lib/admin/deploy-promotion/deploy-execution-guard";
import { resolveRuntimeBannerVariant } from "@/lib/config/resolve-runtime-banner-variant";
import {
  DIBAY_PRODUCTION_APP_ID,
  DIBAY_PRODUCTION_APP_NAME,
  DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS,
  DIBAY_TEST_APP_ID,
  DIBAY_TEST_APP_NAME,
  resolveServerDeployTier,
} from "@/lib/config/test-production-isolation";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";
import {
  buildTestEnvCard,
  fetchGithubCompare,
  fetchGithubMainSha,
  fetchVercelTargetDeploy,
  type EnvServerCard,
} from "@/lib/admin/deploy-promotion/deploy-ops-remote";
import { buildFeatureTestRows } from "@/lib/admin/deploy-promotion/deploy-feature-test-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  const sha = readRuntimeGitSha();
  const banner = resolveRuntimeBannerVariant();
  const db = resolveDataResetDatabaseTarget();
  const promoteExec = evaluateProductionPromoteExecution();
  const rollbackExec = evaluateProductionRollbackExecution();
  const checkedAt = new Date().toISOString();

  let currentRecord = null;
  let matrix = null;
  let evidence: ReturnType<typeof listEvidenceForSha> = [];
  let ledgerHydrated = false;
  if (sha) {
    const hydrate = await hydratePromotionRecordFromLedger(gate.sb, sha);
    ledgerHydrated = hydrate.hydrated;
    const recent = listRecentDeployPromotionRecords(5);
    const prevVerified = recent.find((r) => r.status === "verified" && r.sha !== sha);
    if (prevVerified) {
      invalidateVerifiedIfShaChanged(prevVerified.sha, sha);
    }
    currentRecord = getOrCreatePromotionRecord(sha);
    evidence = listEvidenceForSha(sha);
    const impact = normalizeImpactScope(currentRecord.impactScope);
    matrix = evaluateRequiredGates({ sha, impact, evidence });
  }

  const [mainRef, vercelProd, vercelPreview] = await Promise.all([
    fetchGithubMainSha(),
    fetchVercelTargetDeploy("production"),
    fetchVercelTargetDeploy("preview"),
  ]);

  const productionSha = mainRef.sha;
  const compare =
    sha && productionSha
      ? await fetchGithubCompare(productionSha, sha)
      : {
          status: "not_proven" as const,
          statusReason: !sha
            ? "runtime_sha_missing"
            : mainRef.status === "not_proven"
              ? mainRef.reason
              : "production_sha_missing",
          baseSha: productionSha,
          headSha: sha,
          aheadBy: null,
          behindBy: null,
          commits: null,
          files: [],
          hasDbMigration: false,
          hasAndroidNative: false,
          hasIosNative: false,
          hasEnvHint: false,
          fetchedAt: checkedAt,
        };

  const testCard = buildTestEnvCard({
    runtimeSha: sha,
    projectRef: db.projectRef,
    databaseTarget: db.target,
    bannerVariant: banner.variant,
    vercelTargetEnv: (process.env.VERCEL_TARGET_ENV ?? "").trim() || null,
    deploymentUrl:
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
      (process.env.NEXT_PUBLIC_SITE_URL ?? null),
    promoteAllowed: promoteExec.allowed,
  });

  const productionCard: EnvServerCard = {
    envId: "production",
    labelKo: "실제 운영",
    labelEn: "Production",
    status:
      vercelProd.status === "ok"
        ? "ok"
        : mainRef.status === "ok"
          ? "ok"
          : mainRef.status === "error" || vercelProd.status === "error"
            ? "error"
            : "not_proven",
    statusReason:
      vercelProd.status === "ok"
        ? "vercel_production"
        : mainRef.status === "ok"
          ? "github_main_only_no_vercel_token"
          : vercelProd.statusReason || mainRef.reason,
    url: vercelProd.url,
    versionSha: vercelProd.sha ?? productionSha,
    deploymentId: vercelProd.deploymentId,
    deployedAt: vercelProd.createdAt,
    deployState: vercelProd.readyState,
    supabaseProjectRef: DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS[0] ?? null,
    lastCheckedAt: checkedAt,
    lastError:
      vercelProd.status === "not_proven" && mainRef.status === "ok"
        ? "Vercel Production 상세(배포 ID)는 DIBAY_VERCEL_TOKEN 필요 — GitHub main SHA만 확인됨"
        : vercelProd.status === "error"
          ? vercelProd.statusReason
          : mainRef.status === "error"
            ? mainRef.reason
            : null,
    canTest: false,
    canPromoteToProduction: false,
    source: vercelProd.status === "ok" ? "vercel" : mainRef.status === "ok" ? "github" : "none",
  };

  const previewCard: EnvServerCard = {
    envId: "preview",
    labelKo: "개발 미리보기",
    labelEn: "Preview",
    status:
      banner.variant === "miswired"
        ? "miswired"
        : vercelPreview.status === "ok"
          ? "ok"
          : vercelPreview.status === "error"
            ? "error"
            : "not_proven",
    statusReason:
      banner.variant === "miswired"
        ? "preview_must_not_use_production_db"
        : vercelPreview.statusReason,
    url: vercelPreview.url,
    versionSha: vercelPreview.sha,
    deploymentId: vercelPreview.deploymentId,
    deployedAt: vercelPreview.createdAt,
    deployState: vercelPreview.readyState,
    supabaseProjectRef: null,
    lastCheckedAt: checkedAt,
    lastError:
      banner.variant === "miswired"
        ? "미리보기가 운영 DB를 참조하면 쓰기가 차단됩니다"
        : vercelPreview.status === "not_proven"
          ? "DIBAY_VERCEL_TOKEN 없으면 Preview 배포 목록 조회 불가"
          : null,
    canTest: false,
    canPromoteToProduction: false,
    source: vercelPreview.status === "ok" ? "vercel" : "none",
  };

  const evidenceByGate = new Map<
    string,
    { result: string; evidenceId: string | null; executedAt: string | null; detail: string | null }
  >();
  for (const e of evidence) {
    const prev = evidenceByGate.get(e.gateId);
    if (!prev || (e.executedAt && (!prev.executedAt || e.executedAt > prev.executedAt))) {
      evidenceByGate.set(e.gateId, {
        result: e.result,
        evidenceId: e.evidenceId,
        executedAt: e.executedAt,
        detail: e.detail ?? e.failureReason ?? null,
      });
    }
  }
  const featureTests = buildFeatureTestRows({ sha, evidenceByGate });

  const verified = currentRecord?.status === "verified";
  const statusSemantics = {
    testServerReady: Boolean(sha && testCard.status === "ok"),
    requiredGatesPass: matrix?.ok === true,
    testVerified: verified,
    mockPipelinePass: currentRecord?.pipeline?.mode === "mock_test" && currentRecord.pipeline.allPass,
    productionApplied: false,
    webOnlyPhase1: true,
    androidProven: featureTests.some((f) => f.featureId === "android_app" && f.result === "pass"),
    iosProven: featureTests.some((f) => f.featureId === "ios_app" && f.result === "pass"),
    regularDeployPath:
      "main → Vercel Git Integration → Production (TEST/Preview not required)",
    notesKo: [
      "정규 배포: main 반영 → Production 자동 (TEST·Preview 필수 아님)",
      "Vercel Ready ≠ 앱 기능 정상",
      "TEST 검증 완료 ≠ Production 적용 완료",
      "모의 배포 PASS ≠ 실제 배포 PASS",
      "웹 PASS ≠ Android/iOS·스토어 제출 PASS",
    ],
    notesEn: [
      "Regular ship: land on main → Production auto (TEST/Preview not required)",
      "Vercel Ready ≠ app features OK",
      "TEST verified ≠ production applied",
      "Mock pipeline PASS ≠ real deploy PASS",
      "Web PASS ≠ Android/iOS / store submit PASS",
    ],
  };

  return NextResponse.json({
    ok: true,
    runtimeSha: sha,
    deployTier: resolveServerDeployTier(),
    databaseTarget: db.target,
    projectRef: db.projectRef,
    bannerVariant: banner.variant,
    phase1Layers: DEPLOY_PROMOTE_LAYERS_PHASE1,
    currentRecord,
    recent: listRecentDeployPromotionRecords(20),
    auditHistory: listPromotionHistory(30),
    gateCatalog: DEPLOY_GATE_CATALOG,
    evidenceMatrix: matrix,
    evidence,
    actor: {
      userId: gate.actor.userId,
      isDeployOwner: isDeployOwnerUserId(gate.actor.userId),
      deployOwnerConfigured: deployOwnerIdsConfigured(),
    },
    productionExecution: {
      promote: promoteExec,
      rollback: rollbackExec,
    },
    promoteEnabled: promoteExec.allowed,
    ledgerHydrated,
    checkedAt,
    statusSemantics,
    environments: {
      preview: previewCard,
      test: testCard,
      production: productionCard,
    },
    changeCompare: compare,
    featureTests,
    nativeIdentity: {
      production: { appId: DIBAY_PRODUCTION_APP_ID, appName: DIBAY_PRODUCTION_APP_NAME },
      test: { appId: DIBAY_TEST_APP_ID, appName: DIBAY_TEST_APP_NAME },
      iconSeparation: {
        android: "src/dibayTest mipmap + amber TEST badge (device install still NOT_PROVEN)",
        ios: "AppIcon-Test.appiconset on Debug-Test/Release-Test (device install still NOT_PROVEN)",
      },
      studioHints: {
        android:
          "productFlavor=dibayTest · Firebase dibay-test · src/dibayTest/google-services.json · CAPACITOR_SERVER_URL=TEST then cap:sync:test:android · assembleDibayTestDebug · id=com.dibay.app.test",
        ios: "xcconfig dibay-flavor-test · bundle com.dibay.app.test · sync: npm run cap:sync:test:ios",
      },
    },
  });
}
