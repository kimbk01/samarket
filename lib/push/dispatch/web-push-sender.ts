import webpush from "web-push";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import type { DispatchPushOptions, PushTarget, SendPushResult } from "@/lib/push/dispatch/push-payload-types";
import { ensureWebPushVapidConfigured } from "@/lib/push/web-push-config";

function webPushErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "statusCode" in e) {
    const n = (e as { statusCode?: unknown }).statusCode;
    return typeof n === "number" ? n : undefined;
  }
  return undefined;
}

export function isWebPushConfigured(): boolean {
  return process.env.WEB_PUSH_ENABLED === "1" && ensureWebPushVapidConfigured();
}

export async function sendWebPushToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  if (!isWebPushConfigured()) {
    return { status: "skipped", provider_response: { reason: "web_push_not_configured" } };
  }
  if (target.push_provider !== "web_push") {
    return { status: "skipped", provider_response: { reason: "wrong_provider" } };
  }
  if (!target.endpoint || !target.key_p256dh || !target.key_auth) {
    return { status: "failed", error_message: "missing_vapid_keys" };
  }

  const payload = buildWebPushJsonPayload(out, opts);
  const subscription = {
    endpoint: target.endpoint,
    keys: {
      p256dh: target.key_p256dh,
      auth: target.key_auth,
    },
  };

  try {
    await webpush.sendNotification(subscription, payload.json, {
      TTL: 86_400,
      urgency: payload.is_call ? "high" : "high",
    });
    return { status: "sent", provider_response: { provider: "web_push" } };
  } catch (e: unknown) {
    const status = webPushErrorStatus(e);
    const gone = status === 404 || status === 410;
    return {
      status: "failed",
      error_message: gone ? "subscription_gone" : String(e instanceof Error ? e.message : e),
      provider_response: { provider: "web_push", http_status: status ?? null, gone },
    };
  }
}
