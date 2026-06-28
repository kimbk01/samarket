"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { requestNativeNotificationPermissionIfNeeded } from "@/lib/push/native/check-native-notification-permission";
import { logPushRegister, logPushRegisterFail } from "@/lib/push/native/native-push-register-log";

type RegisterResult = { ok: true } | { ok: false; error: string };

/** FCM/APNS token from PushNotifications.register() — not the register POST. */
const FCM_TOKEN_WAIT_MS = 15_000;
/** Per-attempt WebView fetch dispatch budget (Run 1: server hit 0 in 15s). */
const FETCH_DISPATCH_TIMEOUT_MS = 8_000;
/** Initial POST + one retry after dispatch timeout. */
const REGISTER_POST_MAX_ATTEMPTS = 2;

type ApiPostInstrumentation = {
  fetchResolved: boolean;
  jsonParsed: boolean;
};

type PostDeviceRegistrationOpts = {
  instrumentation?: ApiPostInstrumentation;
};

type RegisterPostBaseDetail = {
  platform: unknown;
  push_provider: unknown;
  device_id: unknown;
  user_id: unknown;
  push_token_len: number;
};

function buildRegisterPostBaseDetail(body: Record<string, unknown>): RegisterPostBaseDetail {
  return {
    platform: body.platform,
    push_provider: body.push_provider,
    device_id: body.device_id,
    user_id: body.user_id,
    push_token_len: typeof body.push_token === "string" ? body.push_token.length : 0,
  };
}

function isFetchAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function consumeRegisterFetchResponse(
  res: Response,
  baseDetail: RegisterPostBaseDetail,
  opts: PostDeviceRegistrationOpts | undefined,
  postCompleted: { value: boolean },
): Promise<RegisterResult> {
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

  if (!res.ok || !j.ok) {
    const error = typeof j.error === "string" ? j.error : "register_failed";
    logPushRegister("api_post_done", {
      ...baseDetail,
      ok: false,
      http_status: res.status,
      error,
      orchestration_settled: postCompleted.value,
    });
    logPushRegisterFail("api_post_failed", {
      http_status: res.status,
      error,
      user_id: baseDetail.user_id,
    });
    return { ok: false, error };
  }

  if (postCompleted.value) {
    logPushRegister("api_post_duplicate_late_ignored", {
      ...baseDetail,
      http_status: res.status,
      device_row_id: j.device_row_id ?? null,
    });
    void res.body?.cancel?.().catch(() => undefined);
    return { ok: true };
  }

  postCompleted.value = true;
  logPushRegister("success", {
    http_status: res.status,
    device_row_id: j.device_row_id ?? null,
    user_id: baseDetail.user_id,
  });
  logPushRegister("api_post_done", {
    ...baseDetail,
    ok: true,
    http_status: res.status,
    device_row_id: j.device_row_id ?? null,
    orchestration_settled: false,
  });
  return { ok: true };
}

function attachLateAbortedFetchHandler(
  fetchPromise: Promise<Response>,
  attempt: number,
  baseDetail: RegisterPostBaseDetail,
  dispatchTimedOut: { value: boolean },
  postCompleted: { value: boolean },
): void {
  void fetchPromise
    .then(async (res) => {
      if (!dispatchTimedOut.value) return;
      if (postCompleted.value) {
        logPushRegister("api_post_duplicate_late_ignored", {
          ...baseDetail,
          attempt,
          http_status: res.status,
          reason: "aborted_attempt_late",
        });
      }
      await res.json().catch(() => ({}));
    })
    .catch(() => undefined);
}

async function postDeviceRegistration(
  body: Record<string, unknown>,
  opts?: PostDeviceRegistrationOpts,
): Promise<RegisterResult> {
  const baseDetail = buildRegisterPostBaseDetail(body);
  const postCompleted = { value: false };

  for (let attempt = 0; attempt < REGISTER_POST_MAX_ATTEMPTS; attempt += 1) {
    if (attempt === 0) {
      logPushRegister("api_post_started", baseDetail);
      logPushRegister("api_post", baseDetail);
    } else {
      logPushRegister("api_fetch_retry_start", { ...baseDetail, attempt });
    }

    const controller = new AbortController();
    const dispatchTimedOut = { value: false };
    const dispatchTimer = window.setTimeout(() => {
      dispatchTimedOut.value = true;
      logPushRegister("api_fetch_dispatch_timeout", { ...baseDetail, attempt });
      logPushRegister("api_fetch_abort_start", { ...baseDetail, attempt });
      controller.abort();
    }, FETCH_DISPATCH_TIMEOUT_MS);

    const fetchPromise = fetch("/api/me/devices/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    attachLateAbortedFetchHandler(fetchPromise, attempt, baseDetail, dispatchTimedOut, postCompleted);

    try {
      const res = await fetchPromise;
      window.clearTimeout(dispatchTimer);
      const result = await consumeRegisterFetchResponse(res, baseDetail, opts, postCompleted);
      if (result.ok) {
        if (attempt > 0) {
          logPushRegister("api_fetch_retry_done", {
            ...baseDetail,
            attempt,
            http_status: res.status,
          });
        }
        return result;
      }
      return result;
    } catch (error) {
      window.clearTimeout(dispatchTimer);
      if (postCompleted.value) return { ok: true };
      if (isFetchAbortError(error)) {
        if (attempt + 1 < REGISTER_POST_MAX_ATTEMPTS) continue;
        logPushRegisterFail("api_fetch_retry_failed", {
          ...baseDetail,
          attempt,
          reason: "dispatch_timeout",
        });
        return { ok: false, error: "fetch_dispatch_timeout" };
      }
      const message = error instanceof Error ? error.message : "register_failed";
      logPushRegisterFail("api_post_failed", {
        ...baseDetail,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  logPushRegisterFail("api_fetch_retry_failed", {
    ...baseDetail,
    reason: "exhausted",
  });
  return { ok: false, error: "fetch_dispatch_timeout" };
}

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
      let registrationListenerInvocations = 0;
      let tokenReceived = false;
      const tokenWait = { timer: undefined as number | undefined };
      const apiInstrumentation: ApiPostInstrumentation = {
        fetchResolved: false,
        jsonParsed: false,
      };

      const finish = (result: RegisterResult) => {
        if (settled) return;
        settled = true;
        if (tokenWait.timer != null) window.clearTimeout(tokenWait.timer);
        void regHandle.then((h) => h.remove()).catch(() => undefined);
        void errHandle.then((h) => h.remove()).catch(() => undefined);
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
        tokenReceived = true;
        if (tokenWait.timer != null) window.clearTimeout(tokenWait.timer);
        void postDeviceRegistration(
          {
            user_id: resolvedUserId || undefined,
            platform,
            device_id: deviceId,
            push_token: value,
            push_provider: pushProvider,
            app_version: appVersion,
          },
          { instrumentation: apiInstrumentation },
        ).then((result) => {
          if (settled) return;
          finish(result);
        });
      });

      const errHandle = PushNotifications.addListener("registrationError", (err) => {
        finish({ ok: false, error: err.error ?? "registration_error" });
      });

      tokenWait.timer = window.setTimeout(() => {
        if (tokenReceived) return;
        logPushRegister("registration_timeout_before_api_response", {
          platform,
          push_provider: pushProvider,
          user_id: resolvedUserId || null,
          device_id: deviceId,
          json_parsed: apiInstrumentation.jsonParsed,
          listener_invocations: registrationListenerInvocations,
          phase: "fcm_token_wait",
        });
        finish({ ok: false, error: "registration_timeout" });
      }, FCM_TOKEN_WAIT_MS);

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
