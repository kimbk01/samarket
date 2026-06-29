"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  evaluateDeviceRegisterGate,
  markDeviceRegisterFailure,
  markDeviceRegisterSuccess,
  peekDeviceRegisterSuccessAgeMs,
  recordDeviceRegisterProceedAttempt,
} from "@/lib/push/device-register/device-register-gate";
import {
  deviceRegisterIdentityKey,
  deviceRegisterLogPayload,
  type DeviceRegisterIdentity,
  type DeviceRegisterPath,
} from "@/lib/push/device-register/device-register-identity";

export type DeviceRegisterPostResult = { ok: true } | { ok: false; error: string };

export type DeviceRegisterPostFn = (identity: DeviceRegisterIdentity) => Promise<DeviceRegisterPostResult>;

const DEFAULT_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;

function logCallsites(callsite: string, identity: DeviceRegisterIdentity, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    // eslint-disable-next-line no-console -- Vercel anomaly diagnosis SSOT
    console.info("[device_register] device_register_callsite", deviceRegisterLogPayload(identity, { callsite, ...extra }));
  } catch {
    /* ignore */
  }
}

/**
 * Central SSOT — same userId+deviceId+platform+pushProvider+pushToken POST at most once per TTL.
 * Inflight joins; failure uses exponential backoff.
 */
export async function registerDeviceOnce(
  identity: DeviceRegisterIdentity,
  callsite: string,
  postFn: DeviceRegisterPostFn,
  opts?: { successTtlMs?: number; force?: boolean },
): Promise<DeviceRegisterPostResult> {
  logCallsites(callsite, identity, { phase: "enter" });

  if (!opts?.force) {
    const gate = evaluateDeviceRegisterGate<DeviceRegisterPostResult>(identity, callsite, {
      successTtlMs: opts?.successTtlMs ?? DEFAULT_SUCCESS_TTL_MS,
    });
    if (gate.action === "skip_same_identity") {
      return { ok: true };
    }
    if (gate.action === "backoff") {
      return { ok: false, error: "register_backoff" };
    }
    if (gate.action === "loop_guard_blocked") {
      return { ok: false, error: "register_loop_guard" };
    }
  }

  const flightKey = `device-register:${deviceRegisterIdentityKey(identity)}`;
  return runSingleFlight(flightKey, async () => {
    if (!opts?.force) {
      const recheck = evaluateDeviceRegisterGate<DeviceRegisterPostResult>(identity, callsite, {
        successTtlMs: opts?.successTtlMs ?? DEFAULT_SUCCESS_TTL_MS,
      });
      if (recheck.action === "skip_same_identity") {
        return { ok: true };
      }
      if (recheck.action === "backoff") {
        return { ok: false, error: "register_backoff" };
      }
      if (recheck.action === "loop_guard_blocked") {
        return { ok: false, error: "register_loop_guard" };
      }
    }

    const loop = recordDeviceRegisterProceedAttempt(identity, callsite);
    if (loop.action === "loop_guard_blocked") {
      return { ok: false, error: "register_loop_guard" };
    }

    const result = await postFn(identity);
    if (result.ok) {
      if (peekDeviceRegisterSuccessAgeMs(identity) == null) {
        markDeviceRegisterSuccess(identity, "js_fetch");
      }
    } else {
      markDeviceRegisterFailure(identity);
    }
    return result;
  });
}

export function shouldSkipDeviceRegisterPost(
  identity: DeviceRegisterIdentity,
  callsite: string,
  opts?: { successTtlMs?: number },
): boolean {
  const age = peekDeviceRegisterSuccessAgeMs(identity);
  if (age == null) return false;
  const ttl = opts?.successTtlMs ?? DEFAULT_SUCCESS_TTL_MS;
  if (age >= ttl) return false;
  if (typeof console !== "undefined") {
    try {
      // eslint-disable-next-line no-console -- Vercel anomaly diagnosis SSOT
      console.info(
        "[device_register] device_register_skip_same_identity",
        deviceRegisterLogPayload(identity, { callsite, reason: "native_success_ttl", sinceLastMs: age }),
      );
    } catch {
      /* ignore */
    }
  }
  return true;
}

export function markDeviceRegisterNativeSuccess(identity: DeviceRegisterIdentity, callsite: string): void {
  markDeviceRegisterSuccess(identity, "native_http" satisfies DeviceRegisterPath);
  logCallsites(callsite, identity, { phase: "native_success" });
}

export { clearDeviceRegisterGateForUser, resetDeviceRegisterGateForTests } from "@/lib/push/device-register/device-register-gate";
