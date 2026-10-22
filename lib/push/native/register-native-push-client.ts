"use client";

import { resolveClientEverConsentedState } from "@/lib/auth/client-consent-state";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import {
  hasLikelyIosCapacitorShell,
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  ensureNotificationForPushRegister,
  getCachedNotificationReceiveSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import type { DeviceRegisterIdentity } from "@/lib/push/device-register/device-register-identity";
import {
  markDeviceRegisterNativeSuccess,
  prepareDeviceRegisterAfterLogin,
  registerDeviceOnce,
  shouldSkipDeviceRegisterPost,
} from "@/lib/push/device-register/register-device-once";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { logPushRegister, logPushRegisterFail } from "@/lib/push/native/native-push-register-log";
import { registerPushDeviceViaNative } from "@/lib/push/native/native-push-register-bridge";
import { persistCanonicalDeviceIdToNative } from "@/lib/push/native/persist-canonical-device-id";

type RegisterResult = { ok: true } | { ok: false; error: string };

type ApiPostInstrumentation = {
  fetchResolved: boolean;
  jsonParsed: boolean;
};

type PostDeviceRegistrationOpts = {
  instrumentation?: ApiPostInstrumentation;
  /** Orchestration Promise already settled (timeout/error) — late success is logged, not returned. */
  isOrchestrationSettled?: () => boolean;
  callsite?: string;
};

function bodyToDeviceRegisterIdentity(body: Record<string, unknown>): DeviceRegisterIdentity | null {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const pushToken = typeof body.push_token === "string" ? body.push_token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const pushProvider = typeof body.push_provider === "string" ? body.push_provider.trim().toLowerCase() : "fcm";
  if (!deviceId || !pushToken || !platform) return null;
  return { userId, deviceId, pushToken, platform, pushProvider };
}

/**
 * Device/token register is transport — never CLEAR or overwrite durable identity when uid is absent.
 * Non-empty authenticated uid → re-affirm eligible+bound projection.
 */
function projectEligibleAfterDeviceRegisterSuccess(
  userId: string | null | undefined,
  reason: string,
): void {
  const uid = typeof userId === "string" ? userId.trim() : "";
  if (!uid) {
    logPushRegister("eligibility_projection_skipped_empty_uid", { reason });
    return;
  }
  void import("@/lib/push/native/member-call-eligibility-bridge").then(({ setNativeMemberCallEligible }) =>
    setNativeMemberCallEligible(true, reason, uid),
  );
}

let nativePushOrchestrationInflight: Promise<RegisterResult> | null = null;
let nativePushOrchestrationKey = "";

/**
 * `user_devices.app_version` — 설치된 바이너리를 "버전 (빌드)" 로 기록한다(예: "1.2 (4)").
 * 같은 버전에서 빌드만 올린 네이티브 수정도 설치 여부를 서버에서 구분하기 위함
 * (docs/native-build-release-process.md §5). 빌드 번호가 없으면 버전만.
 */
async function getAppVersion(): Promise<string | undefined> {
  if (!isCapacitorNativePlatform()) return undefined;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const version = info.version?.trim();
    if (!version) return undefined;
    const build = info.build?.trim();
    return build ? `${version} (${build})` : version;
  } catch {
    return undefined;
  }
}

async function postDeviceRegistration(
  body: Record<string, unknown>,
  opts?: PostDeviceRegistrationOpts,
): Promise<RegisterResult> {
  const baseDetail = {
    platform: body.platform,
    push_provider: body.push_provider,
    device_id: body.device_id,
    user_id: body.user_id,
    push_token_len: typeof body.push_token === "string" ? body.push_token.length : 0,
  };

  logPushRegister("api_post_started", baseDetail);
  logPushRegister("api_post", baseDetail);

  const res = await fetch("/api/me/devices/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (opts?.instrumentation) opts.instrumentation.fetchResolved = true;
  logPushRegister("api_fetch_resolved", {
    ...baseDetail,
    http_status: res.status,
    ok: res.ok,
  });

  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    device_row_id?: string | null;
  };
  if (opts?.instrumentation) opts.instrumentation.jsonParsed = true;
  logPushRegister("api_json_parsed", {
    ...baseDetail,
    http_status: res.status,
    response_ok: j.ok ?? null,
  });

  const orchestrationSettled = opts?.isOrchestrationSettled?.() ?? false;

  if (!res.ok || !j.ok) {
    const error = typeof j.error === "string" ? j.error : "register_failed";
    logPushRegister("api_post_done", {
      ...baseDetail,
      ok: false,
      http_status: res.status,
      error,
      orchestration_settled: orchestrationSettled,
    });
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
  logPushRegister("api_post_done", {
    ...baseDetail,
    ok: true,
    http_status: res.status,
    device_row_id: j.device_row_id ?? null,
    orchestration_settled: orchestrationSettled,
  });
  if (typeof body.device_id === "string") {
    void persistCanonicalDeviceIdToNative(body.device_id);
  }
  if (typeof body.push_token === "string" && body.push_token.trim()) {
    const { cacheDeviceUnbindPushToken } = await import("@/lib/push/device-unbind-token-cache");
    const provider =
      typeof body.push_provider === "string" && body.push_provider.trim()
        ? body.push_provider.trim()
        : "fcm";
    cacheDeviceUnbindPushToken(body.push_token, provider);
  }
  const id = bodyToDeviceRegisterIdentity(body);
  projectEligibleAfterDeviceRegisterSuccess(id?.userId, "device_register_success");
  if (orchestrationSettled) {
    logPushRegister("api_post_late_after_timeout", {
      ...baseDetail,
      http_status: res.status,
      device_row_id: j.device_row_id ?? null,
    });
  }
  return { ok: true };
}

async function postDeviceRegistrationWithNativeFirst(
  body: Record<string, unknown>,
  opts?: PostDeviceRegistrationOpts,
): Promise<RegisterResult> {
  const identity = bodyToDeviceRegisterIdentity(body);
  const callsite = opts?.callsite ?? "postDeviceRegistrationWithNativeFirst";
  if (!identity) {
    return { ok: false, error: "invalid_device" };
  }

  return registerDeviceOnce(identity, callsite, async (id) => {
    const platform = id.platform;
    const baseDetail = {
      platform: id.platform,
      push_provider: id.pushProvider,
      device_id: id.deviceId,
      user_id: id.userId || undefined,
      push_token_len: id.pushToken.length,
    };
    const appVersion = typeof body.app_version === "string" ? body.app_version.trim() : undefined;

    if (platform === "android") {
      if (shouldSkipDeviceRegisterPost(id, `${callsite}:native_precheck`)) {
        if (opts?.instrumentation) {
          opts.instrumentation.fetchResolved = true;
          opts.instrumentation.jsonParsed = true;
        }
        return { ok: true };
      }

      logPushRegister("native_register_start", baseDetail);

      const nativeResult = await registerPushDeviceViaNative({
        platform,
        device_id: id.deviceId,
        push_token: id.pushToken,
        push_provider: id.pushProvider,
        app_version: appVersion,
        user_id: id.userId || undefined,
      });

      logPushRegister("native_register_post_done", {
        ...baseDetail,
        ok: nativeResult.ok,
        http_status: nativeResult.http_status ?? null,
        error: nativeResult.error ?? null,
        device_row_id: nativeResult.device_row_id ?? null,
      });

      if (nativeResult.ok) {
        if (opts?.instrumentation) {
          opts.instrumentation.fetchResolved = true;
          opts.instrumentation.jsonParsed = true;
        }
        markDeviceRegisterNativeSuccess(id, callsite);
        void persistCanonicalDeviceIdToNative(id.deviceId);
        const { cacheDeviceUnbindPushToken } = await import("@/lib/push/device-unbind-token-cache");
        cacheDeviceUnbindPushToken(id.pushToken, id.pushProvider);
        projectEligibleAfterDeviceRegisterSuccess(id.userId, "native_device_register_success");
        logPushRegister("success", {
          http_status: nativeResult.http_status ?? 200,
          device_row_id: nativeResult.device_row_id ?? null,
          user_id: id.userId || undefined,
          via: "native_http",
        });
        return { ok: true };
      }

      logPushRegisterFail("native_register_failed", {
        ...baseDetail,
        http_status: nativeResult.http_status ?? null,
        error: nativeResult.error ?? "native_register_failed",
      });
      logPushRegister("native_register_fetch_fallback", baseDetail);
    }

    return postDeviceRegistration(body, opts);
  });
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
export async function registerNativePushFromClient(
  userId?: string,
  callsite = "registerNativePushFromClient",
): Promise<RegisterResult> {
  if (!isCapacitorNativePlatform()) {
    logPushRegisterFail("not_native");
    return { ok: false, error: "not_native" };
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const platform = resolveCapacitorShellPlatform();
    if (platform !== "android" && platform !== "ios") {
      logPushRegisterFail("unsupported_platform", { platform });
      return { ok: false, error: "unsupported_platform" };
    }

    const resolvedUserId = userId?.trim() ?? "";
    const deviceId = ensureClientInstanceId();
    const orchestrationKey = `${resolvedUserId}|${deviceId}|${platform}`;
    if (nativePushOrchestrationInflight && nativePushOrchestrationKey === orchestrationKey) {
      return nativePushOrchestrationInflight;
    }

    const run = runRegisterNativePushOrchestration({
      resolvedUserId,
      deviceId,
      platform,
      callsite,
    }).finally(() => {
      if (nativePushOrchestrationKey === orchestrationKey) {
        nativePushOrchestrationInflight = null;
        nativePushOrchestrationKey = "";
      }
    });
    nativePushOrchestrationKey = orchestrationKey;
    nativePushOrchestrationInflight = run;
    return run;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    logPushRegisterFail(message);
    return { ok: false, error: message };
  }
}

async function runRegisterNativePushOrchestration(args: {
  resolvedUserId: string;
  deviceId: string;
  platform: "android" | "ios";
  callsite: string;
}): Promise<RegisterResult> {
  const { resolvedUserId, deviceId, platform, callsite } = args;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    logPushRegister("session_authenticated", {
      platform,
      user_id: resolvedUserId || null,
      device_id: deviceId,
    });

    const cached = getCachedNotificationReceiveSnapshot();
    const pushCheck =
      cached?.receiveReady === true
        ? { ok: true as const, snapshot: cached }
        : await ensureNotificationForPushRegister();
    if (!pushCheck.ok) {
      logPushRegisterFail("permission_not_granted", {
        perm: pushCheck.snapshot.effectiveState,
        receiveReady: pushCheck.snapshot.receiveReady,
        user_id: resolvedUserId || null,
      });
      if (
        pushCheck.snapshot.effectiveState === "DENIED" ||
        pushCheck.snapshot.effectiveState === "PERMANENT_DENIED" ||
        pushCheck.snapshot.effectiveState === "SYSTEM_DISABLED"
      ) {
        void deactivateNativePushForPermissionDenied(deviceId);
      }
      return { ok: false, error: "permission_not_granted" };
    }
    const appVersion = await getAppVersion();
    const pushProvider = platform === "android" ? "fcm" : "apns";
    // PUSH-02 — iOS reports the token's APNs environment so the server picks the matching host.
    const apnsEnvironment =
      pushProvider === "apns"
        ? await import("@/lib/push/native/apns-environment-native")
            .then((m) => m.readNativeApnsEnvironment())
            .catch(() => null)
        : null;

    return await new Promise<RegisterResult>((resolve) => {
      let settled = false;
      let registrationListenerInvocations = 0;
      let regHandle: Promise<{ remove: () => Promise<void> }> | null = null;
      let errHandle: Promise<{ remove: () => Promise<void> }> | null = null;
      const apiInstrumentation: ApiPostInstrumentation = {
        fetchResolved: false,
        jsonParsed: false,
      };

      const finish = (result: RegisterResult) => {
        if (settled) return;
        settled = true;
        void regHandle?.then((h) => h.remove()).catch(() => undefined);
        void errHandle?.then((h) => h.remove()).catch(() => undefined);
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

      const registrationTimeoutMs = platform === "ios" ? 30_000 : 15_000;
      let timer = 0;

      void (async () => {
        regHandle = PushNotifications.addListener("registration", (token) => {
          registrationListenerInvocations += 1;
          const value = token.value?.trim();
          logPushRegister("registration_event", {
            platform,
            push_provider: pushProvider,
            token_len: value?.length ?? 0,
            user_id: resolvedUserId || null,
            listener_invocation: registrationListenerInvocations,
          });
          if (!value) {
            finish({ ok: false, error: "empty_token" });
            return;
          }
          void postDeviceRegistrationWithNativeFirst(
            {
              user_id: resolvedUserId || undefined,
              platform,
              device_id: deviceId,
              push_token: value,
              push_provider: pushProvider,
              app_version: appVersion,
              ...(apnsEnvironment ? { apns_environment: apnsEnvironment } : {}),
            },
            {
              instrumentation: apiInstrumentation,
              isOrchestrationSettled: () => settled,
              callsite: `${callsite}:registration_event`,
            },
          ).then((result) => {
            if (settled) return;
            finish(result);
          });
        });

        errHandle = PushNotifications.addListener("registrationError", (err) => {
          finish({ ok: false, error: err.error ?? "registration_error" });
        });

        await Promise.all([regHandle, errHandle]);

        timer = window.setTimeout(() => {
          if (!apiInstrumentation.fetchResolved) {
            logPushRegister("registration_timeout_before_api_response", {
              platform,
              push_provider: pushProvider,
              user_id: resolvedUserId || null,
              device_id: deviceId,
              json_parsed: apiInstrumentation.jsonParsed,
              listener_invocations: registrationListenerInvocations,
            });
          }
          finish({ ok: false, error: "registration_timeout" });
        }, registrationTimeoutMs);

        logPushRegister("register_call", { platform, push_provider: pushProvider });
        await PushNotifications.register();
      })().catch((e: unknown) => {
        finish({ ok: false, error: e instanceof Error ? e.message : "register_failed" });
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    logPushRegisterFail(message);
    return { ok: false, error: message };
  }
}

export function resetNativePushOrchestrationForTests(): void {
  nativePushOrchestrationInflight = null;
  nativePushOrchestrationKey = "";
}

export function navigateFromDibayDeepLink(deepLink: string): boolean {
  const path = resolveDibayDeepLinkToAppPath(deepLink);
  if (!path || typeof window === "undefined") return false;
  window.location.assign(path);
  return true;
}

let lastVoipPushToken: string | null = null;
let voipAuthUnsubscribe: (() => void) | null = null;

async function registerVoipToken(token: string, userId?: string): Promise<RegisterResult> {
  const normalized = token.trim();
  if (!normalized) {
    return { ok: false, error: "empty_voip_token" };
  }
  lastVoipPushToken = normalized;

  // B4: no device registration before the member's first legal consent.
  // Token is kept; NativePushRegistration retries after consent (retryVoipTokenRegistration).
  if (resolveClientEverConsentedState() !== "consented") {
    logPushRegister("voip_token_register_deferred_consent", { push_provider: "voip_apns" });
    return { ok: false, error: "consent_pending" };
  }

  const deviceId = ensureClientInstanceId();
  const appVersion = await getAppVersion();
  const resolvedUserId = userId?.trim() || "";
  const identity: DeviceRegisterIdentity = {
    userId: resolvedUserId,
    deviceId,
    pushToken: normalized,
    platform: "ios",
    pushProvider: "voip_apns",
  };
  const result = await registerDeviceOnce(identity, "registerVoipToken", async () =>
    postDeviceRegistration({
      platform: "ios",
      device_id: deviceId,
      push_token: normalized,
      push_provider: "voip_apns",
      user_id: resolvedUserId || undefined,
      app_version: appVersion,
    }),
  );

  if (result.ok) {
    logPushRegister("voip_token_register_success", { push_provider: "voip_apns" });
  } else {
    logPushRegisterFail("voip_token_register_failed", { error: result.error, push_provider: "voip_apns" });
  }
  return result;
}

export function retryVoipTokenRegistration(reason: string, userId?: string): void {
  const token = lastVoipPushToken?.trim();
  if (!token) return;
  const uid = userId?.trim();
  if (uid) {
    prepareDeviceRegisterAfterLogin(uid);
  }
  logPushRegister("voip_token_register_retry", { reason, ...(uid ? { user_id: uid } : {}) });
  void registerVoipToken(token, uid).catch((err: unknown) => {
    logPushRegisterFail("voip_token_register_exception", {
      reason,
      error: err instanceof Error ? err.message : String(err),
      push_provider: "voip_apns",
    });
  });
}

let voipListenerAttached = false;

export function isVoipPushTokenListenerAttached(): boolean {
  return voipListenerAttached;
}

/** iOS PushKit VoIP token — native `dibay:voip-token` 이벤트 구독. */
export function attachVoipPushTokenListener(): () => void {
  if (typeof window === "undefined" || voipListenerAttached) return () => undefined;
  if (!hasLikelyIosCapacitorShell()) {
    logPushRegister("voip_listener_attach_skipped", { reason: "not_ios_shell" });
    return () => undefined;
  }
  voipListenerAttached = true;
  logPushRegister("voip_listener_attached", { push_provider: "voip_apns" });

  const onToken = (ev: Event) => {
    const detail = (ev as CustomEvent<{ token?: string }>).detail;
    const token = detail?.token?.trim();
    if (!token) return;
    void registerVoipToken(token).catch((err: unknown) => {
      logPushRegisterFail("voip_token_register_exception", {
        reason: "dibay:voip-token",
        error: err instanceof Error ? err.message : String(err),
        push_provider: "voip_apns",
      });
    });
  };

  const onInvalidated = () => {
    lastVoipPushToken = null;
    void fetch("/api/me/devices/deactivate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ push_provider: "voip_apns" }),
    }).catch((err: unknown) => {
      logPushRegisterFail("voip_token_deactivate_exception", {
        error: err instanceof Error ? err.message : String(err),
        push_provider: "voip_apns",
      });
    });
  };

  if (!voipAuthUnsubscribe) {
    voipAuthUnsubscribe = subscribeDibayAuthStateChange((event, session) => {
      const uid = session?.user?.id?.trim() ?? "";
      if (!uid) return;
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      retryVoipTokenRegistration(`auth:${event}`, uid);
    });
  }

  window.addEventListener("dibay:voip-token", onToken);
  window.addEventListener("dibay:voip-token-invalidated", onInvalidated);
  /**
   * 통화 정상화 계획 v2 §3-2 (C5) — 리스너가 붙은 뒤 앱에 VoIP 토큰 재전달을 요청한다. 앱 시작 직후 발급된 토큰이
   * 리스너 부착 전에 전달돼 사라지면(재시도 15초 후 중단) 토큰 등록이 늦어졌다. 구 iOS 바이너리는 재전달 없이
   * 등록만 재시작한다(무해).
   */
  void import("@/lib/push/native/dibay-voip-call-plugin")
    .then(({ dibayVoipCallPlugin }) => dibayVoipCallPlugin.startVoipRegistration())
    .catch((err: unknown) => {
      logPushRegisterFail("voip_token_replay_request_failed", {
        error: err instanceof Error ? err.message : String(err),
        push_provider: "voip_apns",
      });
    });

  return () => {
    window.removeEventListener("dibay:voip-token", onToken);
    window.removeEventListener("dibay:voip-token-invalidated", onInvalidated);
    voipAuthUnsubscribe?.();
    voipAuthUnsubscribe = null;
    voipListenerAttached = false;
  };
}
