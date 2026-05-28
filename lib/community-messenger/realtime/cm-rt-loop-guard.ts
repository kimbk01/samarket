"use client";

/** 연속 실패 후 쿨다운 진입 임계 */
export const CM_RT_MAX_CONSECUTIVE_FAILURES = 5;

const failureStateByChannelKey = new Map<
  string,
  { consecutiveFailures: number; cooldownUntilMs: number; lastFailureStatus: string | null }
>();

let visibilityListenerInstalled = false;
const deferredRetryWakeCallbacks = new Set<() => void>();

function installVisibilityWakeListener(): void {
  if (visibilityListenerInstalled || typeof document === "undefined") return;
  visibilityListenerInstalled = true;
  const wake = () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (document.visibilityState !== "visible") return;
    for (const cb of deferredRetryWakeCallbacks) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
}

export function cmRtLoopGuardRegisterWakeCallback(cb: () => void): () => void {
  installVisibilityWakeListener();
  deferredRetryWakeCallbacks.add(cb);
  return () => {
    deferredRetryWakeCallbacks.delete(cb);
  };
}

export function cmRtShouldDeferRetries(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "hidden" ? false : true;
}

export function cmRtComputeRetryDelayMs(channelKey: string, attempt: number): number {
  const row = failureStateByChannelKey.get(channelKey);
  const now = Date.now();
  if (row && row.cooldownUntilMs > now) {
    return row.cooldownUntilMs - now;
  }
  const base = Math.min(20_000, 350 * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * 220);
  let wait = base + jitter;
  if (cmRtShouldDeferRetries()) {
    wait = Math.max(wait, 5_000);
  }
  return wait;
}

export function cmRtRecordSubscribeFailure(channelKey: string, status: string): {
  enteredCooldown: boolean;
  consecutiveFailures: number;
  cooldownMs: number;
} {
  const now = Date.now();
  const prev = failureStateByChannelKey.get(channelKey) ?? {
    consecutiveFailures: 0,
    cooldownUntilMs: 0,
    lastFailureStatus: null,
  };
  const consecutiveFailures = prev.consecutiveFailures + 1;
  let cooldownUntilMs = prev.cooldownUntilMs;
  let enteredCooldown = false;
  if (consecutiveFailures >= CM_RT_MAX_CONSECUTIVE_FAILURES) {
    const span = 10_000 + Math.floor(Math.random() * 20_000);
    cooldownUntilMs = now + span;
    enteredCooldown = true;
    cmRtLoopGuardDevLog("cooldown_enter", {
      key: channelKey,
      failureCount: consecutiveFailures,
      cooldownMs: span,
      status,
    });
  }
  failureStateByChannelKey.set(channelKey, {
    consecutiveFailures,
    cooldownUntilMs,
    lastFailureStatus: status,
  });
  return { enteredCooldown, consecutiveFailures, cooldownMs: Math.max(0, cooldownUntilMs - now) };
}

export function cmRtRecordSubscribeSuccess(channelKey: string): void {
  const prev = failureStateByChannelKey.get(channelKey);
  if (prev && prev.cooldownUntilMs > 0) {
    cmRtLoopGuardDevLog("cooldown_exit", { key: channelKey, failureCount: 0 });
  }
  failureStateByChannelKey.delete(channelKey);
}

export function cmRtResetFailureState(channelKey: string): void {
  failureStateByChannelKey.delete(channelKey);
}

const devRegistryLogEnabled =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function cmRtLoopGuardDevLog(
  event: "cooldown_enter" | "cooldown_exit",
  payload: Record<string, unknown>
): void {
  if (!devRegistryLogEnabled) return;
  try {
    // eslint-disable-next-line no-console -- dev-only loop guard
    console.warn("[cm-rt-loop-guard]", { event, ...payload });
  } catch {
    /* ignore */
  }
}

export function cmRtRegistryDevLog(
  event: "create" | "reuse" | "remove" | "skip-stale-retry" | "cooldown_enter" | "cooldown_exit",
  payload: Record<string, unknown>
): void {
  if (!devRegistryLogEnabled) return;
  try {
    // eslint-disable-next-line no-console -- dev-only cm-rt-registry
    console.warn("[cm-rt-registry]", { event, ...payload });
  } catch {
    /* ignore */
  }
}

export function cmRtPresenceIsolatedError(reason: string, detail: Record<string, unknown>): void {
  if (!devRegistryLogEnabled) return;
  try {
    // eslint-disable-next-line no-console -- dev-only presence isolation
    console.warn("[cm-rt-presence]", { event: "isolated_error", reason, ...detail });
  } catch {
    /* ignore */
  }
}
