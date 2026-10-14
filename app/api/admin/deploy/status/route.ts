import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  DEPLOY_PROMOTE_LAYERS_PHASE1,
  readRuntimeGitSha,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  getDeployPromotionRecord,
  listRecentDeployPromotionRecords,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
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

  return NextResponse.json({
    ok: true,
    runtimeSha: sha,
    deployTier: resolveServerDeployTier(),
    databaseTarget: db.target,
    projectRef: db.projectRef,
    bannerVariant: banner.variant,
    phase1Layers: DEPLOY_PROMOTE_LAYERS_PHASE1,
    currentRecord: sha ? getDeployPromotionRecord(sha) : null,
    recent: listRecentDeployPromotionRecords(20),
    promoteEnabled: (process.env.DIBAY_PROMOTE_ENABLED ?? "").trim() === "1",
  });
}
