/**
 * Local Runtime vs Hybrid Remote — mutually exclusive runtime mode flag.
 * Product cutover: Local Runtime is DEFAULT.
 */

export type StartupRuntimeMode = {
  localRuntime: boolean;
  legacyRemoteRuntime: boolean;
};

export function resolveStartupRuntimeMode(env: {
  dibayLocalRuntime?: string | null | undefined;
} = {}): StartupRuntimeMode {
  const raw = (env.dibayLocalRuntime ?? "1").trim().toLowerCase();
  // Explicit legacy only when forced off.
  if (raw === "0" || raw === "false" || raw === "off" || raw === "legacy") {
    return { localRuntime: false, legacyRemoteRuntime: true };
  }
  return { localRuntime: true, legacyRemoteRuntime: false };
}

export function assertExclusiveStartupRuntimeMode(mode: StartupRuntimeMode): void {
  const both = mode.localRuntime && mode.legacyRemoteRuntime;
  const neither = !mode.localRuntime && !mode.legacyRemoteRuntime;
  if (both || neither) {
    throw new Error(
      `Startup runtime mode must be exclusive (local XOR legacy); got local=${mode.localRuntime} legacy=${mode.legacyRemoteRuntime}`
    );
  }
}

export function readStartupRuntimeModeFromWindow(
  win: Window & { __DIBAY_LOCAL_RUNTIME__?: unknown } = typeof window !== "undefined"
    ? window
    : ({} as Window)
): StartupRuntimeMode {
  const flag = win.__DIBAY_LOCAL_RUNTIME__ as unknown;
  if (flag === false || flag === 0 || flag === "0") {
    return { localRuntime: false, legacyRemoteRuntime: true };
  }
  if (flag === true || flag === 1 || flag === "1") {
    return { localRuntime: true, legacyRemoteRuntime: false };
  }
  return resolveStartupRuntimeMode({
    dibayLocalRuntime:
      typeof process !== "undefined" ? process.env.DIBAY_LOCAL_RUNTIME : "1",
  });
}
