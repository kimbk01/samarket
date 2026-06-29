"use client";

import {
  deviceRegisterIdentityKey,
  deviceRegisterLogPayload,
  type DeviceRegisterIdentity,
} from "@/lib/push/device-register/device-register-identity";

export type DeviceRegisterGateResult<T> =
  | { action: "proceed" }
  | { action: "skip_same_identity"; sinceLastMs: number }
  | { action: "join_inflight"; promise: Promise<T> }
  | { action: "backoff"; sinceLastMs: number; retryAfterMs: number }
  | { action: "loop_guard_blocked"; reason: string };

type SuccessEntry = {
  key: string;
  at: number;
};

type FailureEntry = {
  key: string;
  at: number;
  attempt: number;
};

const DEFAULT_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const LOOP_GUARD_WINDOW_MS = 60_000;
const LOOP_GUARD_MAX_ATTEMPTS = 8;

let successEntry: SuccessEntry | null = null;
let failureEntry: FailureEntry | null = null;
const recentAttemptKeys: number[] = [];

function logDeviceRegister(step: string, identity: DeviceRegisterIdentity, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    // eslint-disable-next-line no-console -- Vercel anomaly diagnosis SSOT
    console.info(`[device_register] ${step}`, deviceRegisterLogPayload(identity, extra));
  } catch {
    /* ignore */
  }
}

function pruneLoopGuard(now: number): void {
  while (recentAttemptKeys.length > 0 && now - recentAttemptKeys[0]! > LOOP_GUARD_WINDOW_MS) {
    recentAttemptKeys.shift();
  }
}

function computeRetryAfterMs(attempt: number): number {
  const exp = MIN_RETRY_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(MAX_RETRY_MS, exp);
}

export function clearDeviceRegisterGateForUser(userId?: string): void {
  const uid = userId?.trim() ?? "";
  if (!uid) {
    successEntry = null;
    failureEntry = null;
    recentAttemptKeys.length = 0;
    return;
  }
  if (successEntry && !successEntry.key.startsWith(`${uid}|`)) {
    /* keep — different user */
  } else if (successEntry?.key.startsWith(`${uid}|`)) {
    successEntry = null;
  }
  if (failureEntry?.key.startsWith(`${uid}|`)) {
    failureEntry = null;
  }
}

export function resetDeviceRegisterGateForTests(): void {
  successEntry = null;
  failureEntry = null;
  recentAttemptKeys.length = 0;
}

export function peekDeviceRegisterSuccessAgeMs(identity: DeviceRegisterIdentity, now = Date.now()): number | null {
  const key = deviceRegisterIdentityKey(identity);
  if (!successEntry || successEntry.key !== key) return null;
  return Math.max(0, now - successEntry.at);
}

export function evaluateDeviceRegisterGate<T>(
  identity: DeviceRegisterIdentity,
  callsite: string,
  opts?: { successTtlMs?: number; now?: number },
): DeviceRegisterGateResult<T> {
  const now = opts?.now ?? Date.now();
  const successTtlMs = opts?.successTtlMs ?? DEFAULT_SUCCESS_TTL_MS;
  const key = deviceRegisterIdentityKey(identity);

  if (successEntry?.key === key) {
    const sinceLastMs = now - successEntry.at;
    if (sinceLastMs < successTtlMs) {
      logDeviceRegister("device_register_skip_same_identity", identity, {
        callsite,
        reason: "success_ttl",
        sinceLastMs,
        inflight: false,
      });
      return { action: "skip_same_identity", sinceLastMs };
    }
  }

  if (failureEntry?.key === key) {
    const retryAfterMs = computeRetryAfterMs(failureEntry.attempt);
    const sinceLastMs = now - failureEntry.at;
    if (sinceLastMs < retryAfterMs) {
      logDeviceRegister("device_register_retry_scheduled", identity, {
        callsite,
        reason: "failure_backoff",
        sinceLastMs,
        retryAfterMs,
        inflight: false,
      });
      return { action: "backoff", sinceLastMs, retryAfterMs };
    }
  }

  logDeviceRegister("device_register_attempt", identity, {
    callsite,
    reason: "proceed",
    sinceLastMs: successEntry?.key === key ? now - successEntry.at : -1,
    inflight: false,
  });
  return { action: "proceed" };
}

export function recordDeviceRegisterProceedAttempt(
  identity: DeviceRegisterIdentity,
  callsite: string,
  now = Date.now(),
): DeviceRegisterGateResult<never> {
  pruneLoopGuard(now);
  if (recentAttemptKeys.length >= LOOP_GUARD_MAX_ATTEMPTS) {
    logDeviceRegister("device_register_loop_guard_blocked", identity, {
      callsite,
      reason: "attempt_burst",
      inflight: false,
    });
    return { action: "loop_guard_blocked", reason: "attempt_burst" };
  }
  recentAttemptKeys.push(now);
  return { action: "proceed" };
}

export function markDeviceRegisterSuccess(identity: DeviceRegisterIdentity, path: string): void {
  const key = deviceRegisterIdentityKey(identity);
  successEntry = { key, at: Date.now() };
  failureEntry = failureEntry?.key === key ? null : failureEntry;
  logDeviceRegister("device_register_success", identity, {
    callsite: "gate",
    reason: "registered",
    path,
    inflight: false,
    sinceLastMs: 0,
  });
}

export function markDeviceRegisterFailure(identity: DeviceRegisterIdentity): void {
  const key = deviceRegisterIdentityKey(identity);
  const prevAttempt = failureEntry?.key === key ? failureEntry.attempt : 0;
  failureEntry = { key, at: Date.now(), attempt: prevAttempt + 1 };
}
