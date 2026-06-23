import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import {
  getFcmEnvDiagnostics,
  isFcmConfigured,
} from "@/lib/push/dispatch/read-fcm-service-account";
import type { DispatchPushOptions, PushTarget, SendPushResult } from "@/lib/push/dispatch/push-payload-types";

export {
  fcmConfigSource,
  getFcmEnvDiagnostics,
  isFcmConfigured,
  logFcmEnvDiagnostics,
} from "@/lib/push/dispatch/read-fcm-service-account";

/**
 * FCM HTTP v1 send — requires FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_JSON_BASE64.
 * fcm_not_configured 는 sendFcmMessageV1 → warmFcmHttpClient() 경로에서만 반환 (early gate 없음).
 */
export async function sendFcmToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  if (target.push_provider !== "fcm") {
    return { status: "skipped", provider_response: { reason: "wrong_provider" } };
  }

  try {
    const { sendFcmMessageV1 } = await import("@/lib/push/dispatch/fcm-sender-impl");
    const payload = buildWebPushJsonPayload(out, opts);
    const result = await sendFcmMessageV1({
      token: target.push_token,
      data: payload.data,
      title: out.title,
      body: out.body ?? "",
      isCall: payload.is_call,
    });
    if (result.status === "skipped" && result.provider_response?.reason === "fcm_not_configured") {
      const diag = getFcmEnvDiagnostics();
      console.warn("[sendFcmToTarget] fcm_not_configured", {
        source: diag.source,
        has_project_id: diag.has_project_id,
        has_client_email: diag.has_client_email,
        private_key_length: diag.private_key_length,
        isFcmConfigured: isFcmConfigured(),
      });
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot find module") || msg.includes("fcm-sender-impl")) {
      return { status: "skipped", provider_response: { reason: "fcm_impl_pending" } };
    }
    return { status: "failed", error_message: msg, provider_response: { provider: "fcm" } };
  }
}
