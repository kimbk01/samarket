/** call-v3 kill switch — production default OFF; QA via env or localStorage. */

import { logCallV3 } from "@/lib/call-v3/call-v3-log";

const ENV_KEY = "NEXT_PUBLIC_CALL_V3_ENABLED";
export const CALL_V3_LOCAL_OVERRIDE_KEY = "call_v3_override";

export type CallV3FeatureFlagSnapshot = {
  enabled: boolean;
  env: string | null;
  override: string | null;
  hasWindow: boolean;
};

export function getCallV3FeatureFlagSnapshot(): CallV3FeatureFlagSnapshot {
  const hasWindow = typeof window !== "undefined";
  let override: string | null = null;
  if (hasWindow) {
    try {
      override = window.localStorage.getItem(CALL_V3_LOCAL_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
  }
  const raw = process.env[ENV_KEY] ?? null;
  let enabled = raw === "1" || raw === "true";
  if (hasWindow && override != null) {
    if (override === "1" || override === "true") enabled = true;
    if (override === "0" || override === "false") enabled = false;
  }
  return { enabled, env: raw, override, hasWindow };
}

export function isCallV3Enabled(): boolean {
  return getCallV3FeatureFlagSnapshot().enabled;
}

export function logCallV3FeatureFlag(source: string): void {
  logCallV3("feature_flag", { ...getCallV3FeatureFlagSnapshot(), source });
}

export function setCallV3LocalOverride(enabled: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled === null) {
      window.localStorage.removeItem(CALL_V3_LOCAL_OVERRIDE_KEY);
      return;
    }
    window.localStorage.setItem(CALL_V3_LOCAL_OVERRIDE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
