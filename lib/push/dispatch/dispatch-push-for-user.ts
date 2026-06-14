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
  type DispatchDeliveryAudit,
  type DispatchPushOptions,
  type DispatchPushResult,
  type PushTarget,
  type SendPushResult,
} from "@/lib/push/dispatch/push-payload-types";
import { isWebPushConfigured, sendWebPushToTarget } from "@/lib/push/dispatch/web-push-sender";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export function isPushDispatchEnabled(): boolean {
  return process.env.PUSH_DISPATCH_ENABLED === "1" || process.env.WEB_PUSH_ENABLED === "1";
}

function isForceDispatch(opts?: DispatchPushOptions): boolean {
  return opts?.force_dispatch === true;
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

async function auditDelivery(
  svc: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  audits: DispatchDeliveryAudit[],
  row: {
    user_id: string;
    device_id?: string | null;
    event_type: string;
    target_type?: string | null;
    target_id?: string | null;
    status: DispatchDeliveryAudit["status"];
    provider_response?: Record<string, unknown> | null;
    push_provider?: string | null;
  }
): Promise<string | null> {
  const deliveryId = await insertNotificationDelivery(svc, row);
  audits.push({
    id: deliveryId,
    status: row.status,
    event_type: row.event_type,
    device_id: row.device_id ?? null,
    push_provider: row.push_provider ?? null,
    provider_response: row.provider_response ?? null,
  });
  if (!deliveryId) {
    console.error("[dispatchPushForUser] insertNotificationDelivery failed", {
      user_id: row.user_id,
      status: row.status,
      event_type: row.event_type,
    });
  }
  return deliveryId;
}

/**
 * Unified push dispatch — Web Push + FCM + APNS + VoIP.
 * All attempts logged to notification_deliveries when table exists.
 */
export async function dispatchPushForUser(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): Promise<DispatchPushResult> {
  const force = isForceDispatch(opts);
  const audits: DispatchDeliveryAudit[] = [];
  const eventType = resolveEventType(out, opts);
  const logCtx = { user_id: out.user_id, force, event_type: eventType, target_type: opts?.target_type ?? null };

  console.info("[dispatchPushForUser] start", logCtx);

  if (!isPushDispatchEnabled() && !force) {
    console.info("[dispatchPushForUser] skipped — dispatch gate off", logCtx);
    return { ok: true, targets_found: 0, deliveries: audits, skipped_reason: "dispatch_disabled" };
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    console.error("[dispatchPushForUser] service client missing", logCtx);
    return { ok: false, targets_found: 0, deliveries: audits, skipped_reason: "server_misconfigured" };
  }

  const callPush = isCallPush(out, opts);
  const cancelDismiss = opts?.call_push_kind === "call_canceled";

  if (!opts?.skip_settings_gate && !cancelDismiss) {
    const allowed = await shouldSendWebPushForUser(svc, out.user_id, out).catch(() => true);
    if (!allowed) {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: "user_settings_gate" },
      });
      console.info("[dispatchPushForUser] done — settings gate", { ...logCtx, deliveries: audits.length });
      return { ok: true, targets_found: 0, deliveries: audits };
    }
  }

  const targets = await loadActivePushTargets(svc, out.user_id);
  console.info("[dispatchPushForUser] targets loaded", { ...logCtx, targets_found: targets.length });

  if (!targets.length) {
    await auditDelivery(svc, audits, {
      user_id: out.user_id,
      event_type: eventType,
      target_type: opts?.target_type ?? null,
      target_id: opts?.target_id ?? null,
      status: "skipped",
      provider_response: { reason: "no_active_targets" },
    });
    console.info("[dispatchPushForUser] done — no targets", { ...logCtx, deliveries: audits.length });
    return { ok: true, targets_found: 0, deliveries: audits };
  }

  for (const target of targets) {
    if (callPush && target.push_provider === "web_push" && cancelDismiss) {
      /* cancel dismiss goes to all providers including web */
    } else if (callPush && !cancelDismiss) {
      if (
        target.push_provider === "web_push" &&
        targets.some((t) => t.push_provider === "fcm" || t.push_provider === "voip_apns")
      ) {
        await auditDelivery(svc, audits, {
          user_id: out.user_id,
          device_id: deviceIdForDelivery(target),
          event_type: eventType,
          target_type: opts?.target_type ?? null,
          target_id: opts?.target_id ?? null,
          status: "skipped",
          provider_response: { reason: "native_call_preferred" },
          push_provider: target.push_provider,
        });
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

    const providerResponse = {
      ...(result.provider_response ?? {}),
      target_source: target.source,
      push_provider: target.push_provider,
      ...(result.error_message ? { error: result.error_message } : {}),
    };

    if (deliveryId) {
      const { error: updateErr } = await svc
        .from("notification_deliveries")
        .update({
          status: result.status,
          provider_response: providerResponse,
        })
        .eq("id", deliveryId);
      if (updateErr) {
        console.error("[dispatchPushForUser] delivery update failed", {
          deliveryId,
          status: result.status,
          message: updateErr.message,
        });
      }
    } else {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        device_id: deviceIdForDelivery(target),
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: result.status,
        provider_response: providerResponse,
        push_provider: target.push_provider,
      });
      continue;
    }

    audits.push({
      id: deliveryId,
      status: result.status,
      event_type: eventType,
      device_id: deviceIdForDelivery(target),
      push_provider: target.push_provider,
      provider_response: providerResponse,
    });

    if (shouldDeactivateTarget(result, target)) {
      const reason = result.provider_response?.gone === true ? "gone" : "failed";
      await deactivateFailedPushTarget(svc, target, reason);
    } else if (result.status === "failed" && target.source === "web_push_subscriptions") {
      await deactivateFailedPushTarget(svc, target, "failed");
    }
  }

  console.info("[dispatchPushForUser] done", {
    ...logCtx,
    targets_found: targets.length,
    deliveries: audits.length,
    statuses: audits.map((d) => d.status),
  });

  return { ok: true, targets_found: targets.length, deliveries: audits };
}
