"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { requestNativeNotificationPermissionIfNeeded } from "@/lib/push/native/check-native-notification-permission";
import { logPushRegister, logPushRegisterFail } from "@/lib/push/native/native-push-register-log";

type RegisterResult = { ok: true } | { ok: false; error: string };

async function getAppVersion(): Promise<string | undefined> {
  if (!isCapacitorNativePlatform()) return undefined;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function postDeviceRegistration(body: Record<string, unknown>): Promise<RegisterResult> {
  logPushRegister("api_post", {
    platform: body.platform,
    push_provider: body.push_provider,
    device_id: body.device_id,
    user_id: body.user_id,
    push_token_len: typeof body.push_token === "string" ? body.push_token.length : 0,
  });

  const res = await fetch("/api/me/devices/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    device_row_id?: string | null;
  };
  if (!res.ok || !j.ok) {
    const error = typeof j.error === "string" ? j.error : "register_failed";
    logPushRegisterFail("api_post_failed", {
      http_status: res.status,
      error,
      user_id: body.user_id,
    });
    return { ok: false, error };
  }
  logPushRegister("success", {
    http_status: res.status,
    device_row_id: j.device_row_id ?? null,
    user_id: body.user_id,
  });
  return { ok: true };
}

async function deactivateNativePushForPermissionDenied(deviceId: string): Promise<void> {
  await fetch("/api/me/devices/deactivate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, scope: "device_all_users" }),
  }).catch(() => undefined);
}

/**
 * Capacitor native — FCM/APNS token을 user_devices에 등록.
 * @param userId — 세션 UUID (API body 검증·Logcat 추적용; 서버는 cookie 세션 user_id 를 authoritative 로 쓴다)
 */
export async function registerNativePushFromClient(userId?: string): Promise<RegisterResult> {
  if (!isCapacitorNativePlatform()) {
    logPushRegisterFail("not_native");
    return { ok: false, error: "not_native" };
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform !== "android" && platform !== "ios") {
      logPushRegisterFail("unsupported_platform", { platform });
      return { ok: false, error: "unsupported_platform" };
    }

    const resolvedUserId = userId?.trim() ?? "";
    const deviceId = ensureClientInstanceId();
    logPushRegister("session_authenticated", {
      platform,
      user_id: resolvedUserId || null,
      device_id: deviceId,
    });

    const perm = await requestNativeNotificationPermissionIfNeeded();
    if (perm !== "granted") {
      logPushRegisterFail("permission_not_granted", { perm, user_id: resolvedUserId || null });
      if (perm === "denied") {
        void deactivateNativePushForPermissionDenied(deviceId);
      }
      return { ok: false, error: "permission_not_granted" };
    }
    const appVersion = await getAppVersion();
    const pushProvider = platform === "android" ? "fcm" : "apns";

    return await new Promise<RegisterResult>((resolve) => {
      let settled = false;
      const finish = (result: RegisterResult) => {
        if (settled) return;
        settled = true;
        void regHandle.then((h) => h.remove()).catch(() => undefined);
        void errHandle.then((h) => h.remove()).catch(() => undefined);
        clearTimeout(timer);
        if (!result.ok) {
          logPushRegisterFail(result.error, {
            platform,
            push_provider: pushProvider,
            user_id: resolvedUserId || null,
            device_id: deviceId,
          });
        }
        resolve(result);
      };

      const regHandle = PushNotifications.addListener("registration", (token) => {
        const value = token.value?.trim();
        logPushRegister("registration_event", {
          platform,
          push_provider: pushProvider,
          token_len: value?.length ?? 0,
          user_id: resolvedUserId || null,
        });
        if (!value) {
          finish({ ok: false, error: "empty_token" });
          return;
        }
        void postDeviceRegistration({
          user_id: resolvedUserId || undefined,
          platform,
          device_id: deviceId,
          push_token: value,
          push_provider: pushProvider,
          app_version: appVersion,
        }).then(finish);
      });

      const errHandle = PushNotifications.addListener("registrationError", (err) => {
        finish({ ok: false, error: err.error ?? "registration_error" });
      });

      const timer = window.setTimeout(() => {
        finish({ ok: false, error: "registration_timeout" });
      }, 15_000);

      logPushRegister("register_call", { platform, push_provider: pushProvider });
      void PushNotifications.register().catch((e: unknown) => {
        finish({ ok: false, error: e instanceof Error ? e.message : "register_failed" });
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    logPushRegisterFail(message);
    return { ok: false, error: message };
  }
}

export function navigateFromDibayDeepLink(deepLink: string): boolean {
  const path = resolveDibayDeepLinkToAppPath(deepLink);
  if (!path || typeof window === "undefined") return false;
  window.location.assign(path);
  return true;
}

async function registerVoipToken(token: string): Promise<RegisterResult> {
  const deviceId = ensureClientInstanceId();
  const appVersion = await getAppVersion();
  return postDeviceRegistration({
    platform: "ios",
    device_id: deviceId,
    push_token: token,
    push_provider: "voip_apns",
    app_version: appVersion,
  });
}

let voipListenerAttached = false;

/** iOS PushKit VoIP token — native `dibay:voip-token` 이벤트 구독. */
export function attachVoipPushTokenListener(): () => void {
  if (typeof window === "undefined" || voipListenerAttached) return () => undefined;
  voipListenerAttached = true;

  const onToken = (ev: Event) => {
    const detail = (ev as CustomEvent<{ token?: string }>).detail;
    const token = detail?.token?.trim();
    if (!token) return;
    void registerVoipToken(token).catch(() => undefined);
  };

  const onInvalidated = () => {
    void fetch("/api/me/devices/deactivate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ push_provider: "voip_apns" }),
    }).catch(() => undefined);
  };

  window.addEventListener("dibay:voip-token", onToken);
  window.addEventListener("dibay:voip-token-invalidated", onInvalidated);

  return () => {
    window.removeEventListener("dibay:voip-token", onToken);
    window.removeEventListener("dibay:voip-token-invalidated", onInvalidated);
    voipListenerAttached = false;
  };
}
