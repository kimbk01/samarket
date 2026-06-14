import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { shouldSendWebPushForUser } from "@/lib/notifications/web-push-user-settings-gate";
import { sendApnsToTarget, sendVoipApnsToTarget } from "@/lib/push/dispatch/apns-sender";
import { deactivateFailedPushTarget } from "@/lib/push/dispatch/deactivate-failed-token";
import { sendFcmToTarget } from "@/lib/push/dispatch/fcm-sender";
import {
  insertNotificationDelivery,
  loadActivePushTargets,
} from "@/lib/push/dispatch/load-active-push-targets";
import {
  isCallPush,
  resolveEventType,
  type DispatchPushOptions,
  type PushTarget,
  type SendPushResult,
} from "@/lib/push/dispatch/push-payload-types";
import { isWebPushConfigured, sendWebPushToTarget } from "@/lib/push/dispatch/web-push-sender";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export function isPushDispatchEnabled(): boolean {
  return process.env.PUSH_DISPATCH_ENABLED === "1" || process.env.WEB_PUSH_ENABLED === "1";
}

async function sendToTarget(
  target: PushTarget,
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<SendPushResult> {
  switch (target.push_provider) {
    case "web_push":
      return sendWebPushToTarget(target, out, opts);
    case "fcm":
      return sendFcmToTarget(target, out, opts);
    case "apns":
      return sendApnsToTarget(target, out, opts);
    case "voip_apns":
      return sendVoipApnsToTarget(target, out, opts);
    default:
      return { status: "skipped", provider_response: { reason: "unknown_provider" } };
  }
}

function shouldDeactivateTarget(result: SendPushResult, target: PushTarget): boolean {
  if (result.status !== "failed") return false;
  const resp = result.provider_response;
  if (resp && resp.gone === true) return true;
  const msg = String(result.error_message ?? "").toLowerCase();
  if (msg.includes("subscription_gone") || msg.includes("not_registered") || msg.includes("invalid_registration")) {
    return true;
  }
  if (target.push_provider === "fcm" && resp && resp.invalid_token === true) return true;
  if ((target.push_provider === "apns" || target.push_provider === "voip_apns") && resp && resp.bad_device_token === true) {
    return true;
  }
  return false;
}

function deviceIdForDelivery(target: PushTarget): string | null {
  return target.source === "user_devices" ? target.id : null;
}

/**
 * Unified push dispatch — Web Push + FCM + APNS + VoIP.
 * All attempts logged to notification_deliveries when table exists.
 */
export async function dispatchPushForUser(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<void> {
  if (!isPushDispatchEnabled()) return;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return;

  const callPush = isCallPush(out, opts);
  const cancelDismiss = opts?.call_push_kind === "call_canceled";

  if (!opts?.skip_settings_gate && !cancelDismiss) {
    const allowed = await shouldSendWebPushForUser(svc, out.user_id, out).catch(() => true);
    if (!allowed) {
      const eventType = resolveEventType(out, opts);
      await insertNotificationDelivery(svc, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: "user_settings_gate" },
      });
      return;
    }
  }

  const targets = await loadActivePushTargets(svc, out.user_id);
  if (!targets.length) {
    if (isWebPushConfigured() || process.env.PUSH_DISPATCH_ENABLED === "1") {
      await insertNotificationDelivery(svc, {
        user_id: out.user_id,
        event_type: resolveEventType(out, opts),
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: "no_active_targets" },
      });
    }
    return;
  }

  const eventType = resolveEventType(out, opts);

  for (const target of targets) {
    if (callPush && target.push_provider === "web_push" && cancelDismiss) {
      /* cancel dismiss goes to all providers including web */
    } else if (callPush && !cancelDismiss) {
      /* ringing: prefer voip_apns on iOS, fcm on android, web as fallback */
      if (
        target.push_provider === "web_push" &&
        targets.some((t) => t.push_provider === "fcm" || t.push_provider === "voip_apns")
      ) {
        const deliveryId = await insertNotificationDelivery(svc, {
          user_id: out.user_id,
          device_id: deviceIdForDelivery(target),
          event_type: eventType,
          target_type: opts?.target_type ?? null,
          target_id: opts?.target_id ?? null,
          status: "skipped",
          provider_response: { reason: "native_call_preferred" },
        });
        void deliveryId;
        continue;
      }
    }

    const deliveryId = await insertNotificationDelivery(svc, {
      user_id: out.user_id,
      device_id: deviceIdForDelivery(target),
      event_type: eventType,
      target_type: opts?.target_type ?? null,
      target_id: opts?.target_id ?? null,
      status: "pending",
    });

    const result = await sendToTarget(target, out, opts);

    if (deliveryId) {
      await svc
        .from("notification_deliveries")
        .update({
          status: result.status,
          provider_response: {
            ...(result.provider_response ?? {}),
            target_source: target.source,
            push_provider: target.push_provider,
            ...(result.error_message ? { error: result.error_message } : {}),
          },
        })
        .eq("id", deliveryId);
    }

    if (shouldDeactivateTarget(result, target)) {
      const reason = result.provider_response?.gone === true ? "gone" : "failed";
      await deactivateFailedPushTarget(svc, target, reason);
    } else if (result.status === "failed" && target.source === "web_push_subscriptions") {
      await deactivateFailedPushTarget(svc, target, "failed");
    }
  }
}
