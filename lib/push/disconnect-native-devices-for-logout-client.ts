"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { clearDeviceRegisterGateForUser } from "@/lib/push/device-register/register-device-once";
import {
  clearDeviceUnbindPushToken,
  readDeviceUnbindPushToken,
} from "@/lib/push/device-unbind-token-cache";
import { setNativeMemberCallEligible } from "@/lib/push/native/member-call-eligibility-bridge";
import { deactivateBoundPushDeviceViaNative } from "@/lib/push/native/native-push-deactivate-bridge";

export type DisconnectNativeDevicesResult = {
  ok: boolean;
  mode: "authenticated" | "token_proof" | "native" | "failed" | "skipped";
  httpStatus?: number;
  error?: string;
};

async function postDeactivate(body: Record<string, unknown>): Promise<DisconnectNativeDevicesResult> {
  try {
    const res = await fetch("/api/me/devices/deactivate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; mode?: string; error?: string; code?: string }
      | null;
    if (res.ok && payload?.ok === true) {
      clearDeviceUnbindPushToken();
      return {
        ok: true,
        mode: payload.mode === "token_proof" ? "token_proof" : "authenticated",
        httpStatus: res.status,
      };
    }
    return {
      ok: false,
      mode: "failed",
      httpStatus: res.status,
      error: payload?.code || payload?.error || `http_${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "failed",
      error: error instanceof Error ? error.message : "fetch_failed",
    };
  }
}

function buildUnbindBody(deviceId: string, scope?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { device_id: deviceId };
  if (scope) body.scope = scope;
  const cached = readDeviceUnbindPushToken();
  if (cached?.pushToken) {
    body.push_token = cached.pushToken;
    body.push_provider = cached.pushProvider || "fcm";
  }
  return body;
}

/**
 * 로그아웃 시 native device token 비활성화 (web push unsubscribe 와 병행).
 * Session missing 이어도 device_id + push_token proof 로 현재 기기만 해제한다.
 */
export async function disconnectNativeDevicesForLogout(): Promise<DisconnectNativeDevicesResult> {
  if (typeof window === "undefined") return { ok: true, mode: "skipped" };
  const deviceId = ensureClientInstanceId();
  clearDeviceRegisterGateForUser();
  void setNativeMemberCallEligible(false, "logout_device_disconnect");

  const body = buildUnbindBody(deviceId);
  let result = await postDeactivate(body);

  if (!result.ok) {
    const native = await deactivateBoundPushDeviceViaNative("logout");
    if (native.ok) {
      clearDeviceUnbindPushToken();
      result = { ok: true, mode: "native", httpStatus: native.httpStatus };
    } else if (native.error) {
      result = {
        ok: false,
        mode: "failed",
        httpStatus: native.httpStatus ?? result.httpStatus,
        error: native.error || result.error,
      };
    }
  }

  if (!result.ok) {
    console.warn("[push] logout_device_deactivate_failed", {
      device_id: deviceId,
      httpStatus: result.httpStatus ?? null,
      error: result.error ?? null,
      has_token_proof: Boolean(body.push_token),
    });
  }
  return result;
}

/** 계정 전환 — 동일 기기의 이전 계정 token 즉시 비활성 (authenticated session required) */
export async function disconnectNativeDevicesOnAccountSwitch(): Promise<DisconnectNativeDevicesResult> {
  if (typeof window === "undefined") return { ok: true, mode: "skipped" };
  try {
    const deviceId = ensureClientInstanceId();
    clearDeviceRegisterGateForUser();
    void setNativeMemberCallEligible(false, "account_switch_device_disconnect");
    const body = buildUnbindBody(deviceId, "device_all_users");
    const result = await postDeactivate(body);
    if (!result.ok) {
      console.warn("[push] account_switch_device_deactivate_failed", {
        device_id: deviceId,
        httpStatus: result.httpStatus ?? null,
        error: result.error ?? null,
      });
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      mode: "failed",
      error: error instanceof Error ? error.message : "account_switch_failed",
    };
  }
}
