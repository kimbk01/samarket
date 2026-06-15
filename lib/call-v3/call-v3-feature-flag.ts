/** call-v3 kill switch — production default OFF; QA via env or localStorage. */

const ENV_KEY = "NEXT_PUBLIC_CALL_V3_ENABLED";
const LOCAL_OVERRIDE_KEY = "call_v3_override";

export function isCallV3Enabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(LOCAL_OVERRIDE_KEY);
      if (override === "1" || override === "true") return true;
      if (override === "0" || override === "false") return false;
    } catch {
      /* ignore */
    }
  }
  const raw = process.env[ENV_KEY];
  return raw === "1" || raw === "true";
}

export function setCallV3LocalOverride(enabled: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled === null) {
      window.localStorage.removeItem(LOCAL_OVERRIDE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_OVERRIDE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
