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
import { resolveServerDeployTier } from "@/lib/config/test-production-isolation";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";

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
  });
}
