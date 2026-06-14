import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import type { DispatchPushOptions, PushTarget, SendPushResult } from "@/lib/push/dispatch/push-payload-types";

function parseFcmServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return Boolean(parseFcmServiceAccount());
}

/**
 * FCM HTTP v1 send — requires FCM_SERVICE_ACCOUNT_JSON.
 * Implemented in PR-2 with firebase-admin; returns skipped until configured.
 */
export async function sendFcmToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  if (target.push_provider !== "fcm") {
    return { status: "skipped", provider_response: { reason: "wrong_provider" } };
  }
  if (!isFcmConfigured()) {
    return { status: "skipped", provider_response: { reason: "fcm_not_configured" } };
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
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot find module") || msg.includes("fcm-sender-impl")) {
      return { status: "skipped", provider_response: { reason: "fcm_impl_pending" } };
    }
    return { status: "failed", error_message: msg, provider_response: { provider: "fcm" } };
  }
}
