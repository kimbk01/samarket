import {
  isMiswiredNonProductionOnProductionDb,
  isTestRuntimeSurface,
} from "@/lib/config/test-access-control";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";
import { resolveServerDeployTier } from "@/lib/config/test-production-isolation";

export type DibayRuntimeBannerVariant = "test" | "production" | "miswired" | "hidden";

export function resolveRuntimeBannerVariant(
  env: NodeJS.ProcessEnv = process.env
): { variant: DibayRuntimeBannerVariant; projectRefHint: string | null } {
  const db = resolveDataResetDatabaseTarget(env);
  const ref = db.projectRef;

  if (isMiswiredNonProductionOnProductionDb(env)) {
    return { variant: "miswired", projectRefHint: ref };
  }
  if (isTestRuntimeSurface(env)) {
    return { variant: "test", projectRefHint: ref };
  }
  const tier = resolveServerDeployTier(env);
  if (tier === "production") {
    // Admin layouts may force-show; main consumer app stays clean.
    const force = (env.NEXT_PUBLIC_DIBAY_SHOW_PRODUCTION_BANNER ?? "").trim() === "1";
    return { variant: force ? "production" : "hidden", projectRefHint: ref };
  }
  return { variant: "hidden", projectRefHint: ref };
}
