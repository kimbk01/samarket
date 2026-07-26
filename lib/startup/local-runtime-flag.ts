/**
 * Local Runtime vs Hybrid Remote — mutually exclusive runtime mode flag.
 *
 * @see docs/dibay-local-runtime-startup-rearchitecture.md §10
 *
 * CONTRACT:
 * - Exactly one of localRuntime | legacyRemoteRuntime is true.
 * - Default remains legacyRemoteRuntime until Android/iOS cutover QA PASS.
 * - Build/native may override via env `DIBAY_LOCAL_RUNTIME=1`.
 */

export type StartupRuntimeMode = {
  localRuntime: boolean;
  legacyRemoteRuntime: boolean;
};

export function resolveStartupRuntimeMode(env: {
  dibayLocalRuntime?: string | null | undefined;
} = {}): StartupRuntimeMode {
  const raw = (env.dibayLocalRuntime ?? "").trim();
  const local =
    raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "on";
  if (local) {
    return { localRuntime: true, legacyRemoteRuntime: false };
  }
  return { localRuntime: false, legacyRemoteRuntime: true };
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

/** Browser/runtime read — Capacitor injects `__DIBAY_LOCAL_RUNTIME__` when local mode is on. */
export function readStartupRuntimeModeFromWindow(
  win: Window & { __DIBAY_LOCAL_RUNTIME__?: unknown } = typeof window !== "undefined" ? window : ({} as Window)
): StartupRuntimeMode {
  const flag = win.__DIBAY_LOCAL_RUNTIME__;
  if (flag === true || flag === 1 || flag === "1") {
    return { localRuntime: true, legacyRemoteRuntime: false };
  }
  return resolveStartupRuntimeMode({
    dibayLocalRuntime:
      typeof process !== "undefined" ? process.env.DIBAY_LOCAL_RUNTIME : undefined,
  });
}
