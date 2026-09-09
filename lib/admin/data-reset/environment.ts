/**
 * Data Reset env gate — inherits CUT H fail-closed Production execute ban.
 * Aliases DATA_RESET_* env vars onto the same contract.
 */

import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";

export type DataResetEnvGate = {
  tier: "local" | "staging" | "production";
  previewAllowed: boolean;
  executeAllowed: boolean;
  reasons: string[];
};

export function resolveDataResetEnvGate(env: NodeJS.ProcessEnv = process.env): DataResetEnvGate {
  const merged: NodeJS.ProcessEnv = { ...env };
  // Allow DATA_RESET_ENABLED as alias for PRELAUNCH_RESET_ENABLED
  if (!merged.PRELAUNCH_RESET_ENABLED && merged.DATA_RESET_ENABLED) {
    merged.PRELAUNCH_RESET_ENABLED = merged.DATA_RESET_ENABLED;
  }
  if (!merged.PRELAUNCH_RESET_PRODUCTION_DRY_RUN && merged.DATA_RESET_PRODUCTION_PREVIEW) {
    merged.PRELAUNCH_RESET_PRODUCTION_DRY_RUN = merged.DATA_RESET_PRODUCTION_PREVIEW;
  }

  const base = resolvePrelaunchResetEnvGate(merged);
  return {
    tier: base.tier,
    previewAllowed: base.dryRunAllowed,
    executeAllowed: base.executeAllowed,
    reasons: base.reasons,
  };
}
