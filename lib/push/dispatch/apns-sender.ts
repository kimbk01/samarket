import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import type { DispatchPushOptions, PushTarget, SendPushResult } from "@/lib/push/dispatch/push-payload-types";

function isApnsConfigured(): boolean {
  const key = process.env.APNS_KEY_P8?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  return Boolean(key && keyId && teamId);
}

export function isApnsAlertConfigured(): boolean {
  return isApnsConfigured() && Boolean(process.env.APNS_BUNDLE_ID?.trim());
}

/**
 * APNS alert push — PR-3 full implementation.
 */
export async function sendApnsToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  if (target.push_provider !== "apns") {
    return { status: "skipped", provider_response: { reason: "wrong_provider" } };
  }
  if (!isApnsAlertConfigured()) {
    return { status: "skipped", provider_response: { reason: "apns_not_configured" } };
  }

  try {
    const { sendApnsAlertImpl } = await import("@/lib/push/dispatch/apns-sender-impl");
    const payload = buildWebPushJsonPayload(out, opts);
    return await sendApnsAlertImpl({
      deviceToken: target.push_token,
      title: out.title,
      body: out.body ?? "",
      data: payload.data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error_message: msg, provider_response: { provider: "apns" } };
  }
}

function isVoipApnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_VOIP_KEY_P8?.trim() || process.env.APNS_KEY_P8?.trim()
  ) && Boolean(process.env.APNS_VOIP_TOPIC?.trim() || process.env.APNS_BUNDLE_ID?.trim());
}

export async function sendVoipApnsToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  if (target.push_provider !== "voip_apns") {
    return { status: "skipped", provider_response: { reason: "wrong_provider" } };
  }
  if (!isVoipApnsConfigured()) {
    return { status: "skipped", provider_response: { reason: "voip_apns_not_configured" } };
  }

  try {
    const { sendVoipApnsImpl } = await import("@/lib/push/dispatch/voip-apns-sender-impl");
    const payload = buildWebPushJsonPayload(out, opts);
    return await sendVoipApnsImpl({
      deviceToken: target.push_token,
      data: payload.data,
      callPushKind: opts?.call_push_kind ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "failed", error_message: msg, provider_response: { provider: "voip_apns" } };
  }
}
