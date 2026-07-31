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
  resolveCallPushProviderPolicy,
  resolveEventType,
  type DispatchDeliveryAudit,
  type DispatchPushOptions,
  type DispatchPushResult,
  type PushTarget,
  type SendPushResult,
} from "@/lib/push/dispatch/push-payload-types";
import { ensureNotificationSoundSsotHydratedForServer } from "@/lib/notifications/notification-sound-ssot-server-hydrate";
import { enrichPushPayloadWithSoundSsotMeta } from "@/lib/push/dispatch/push-sound-ssot-enrichment";
import { isWebPushConfigured, sendWebPushToTarget } from "@/lib/push/dispatch/web-push-sender";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolvePushEnvironment } from "@/lib/push/push-environment";
import { evaluateNotificationDeliverySafety } from "@/lib/push/dispatch/notification-delivery-safety-gate";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";

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

function tokenPrefix(target: PushTarget): string | null {
  const token = String(target.push_token ?? "").trim();
  if (!token) return null;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function callIdFromOutput(out: NotificationSideEffectPayloadOut): string | null {
  const meta = out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
  const raw = meta?.session_id ?? meta?.sessionId ?? meta?.callId ?? null;
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || null;
}

function baseDeliveryDiagnostics(target: PushTarget, out: NotificationSideEffectPayloadOut, opts?: DispatchPushOptions) {
  const callId = callIdFromOutput(out);
  const callPush = opts?.call_push_kind ?? null;
  return {
    target_source: target.source,
    push_provider: target.push_provider,
    tokenPrefix: tokenPrefix(target),
    ...(opts?.notification_event_id
      ? { notificationEventId: opts.notification_event_id }
      : {}),
    ...(callId ? { callId } : {}),
    ...(callPush
      ? {
          payloadType: callPush,
          priority: callPush === "incoming_call" ? "high" : undefined,
          ttlMs: callPush === "incoming_call" ? 60_000 : undefined,
        }
      : {}),
  };
}

function scheduleMissingNativeAckDiagnostic(args: {
  svc: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>;
  deliveryId: string;
  callId: string;
  recipientUserId: string;
  sentAt: string;
  tokenPrefix: string | null;
}): void {
  const timer = setTimeout(async () => {
    const { data } = await args.svc
      .from("notification_deliveries")
      .select("provider_response")
      .eq("id", args.deliveryId)
      .maybeSingle();
    const existing =
      data?.provider_response && typeof data.provider_response === "object"
        ? (data.provider_response as Record<string, unknown>)
        : {};
    if (existing.nativeAck) return;
    await args.svc
      .from("notification_deliveries")
      .update({
        provider_response: {
          ...existing,
          diagnostic: "push_delivery_diagnostic_missing_device_ack",
          diagnosticLoggedAt: new Date().toISOString(),
          noAckAfterMs: 10_000,
          callId: args.callId,
          recipientUserId: args.recipientUserId,
          sentAt: args.sentAt,
          tokenPrefix: args.tokenPrefix,
        },
      })
      .eq("id", args.deliveryId);
    console.warn("[DIBAY_CALL_PUSH] push_delivery_diagnostic_missing_device_ack", {
      callId: args.callId,
      recipientUserId: args.recipientUserId,
      deliveryId: args.deliveryId,
    });
  }, 10_000);
  (timer as unknown as { unref?: () => void }).unref?.();
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
    notification_event_id?: string | null;
    environment?: ReturnType<typeof resolvePushEnvironment>;
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

  await ensureNotificationSoundSsotHydratedForServer(svc);
  const enrichedOut = enrichPushPayloadWithSoundSsotMeta(out, opts);
  const callPush = isCallPush(enrichedOut, opts);
  const terminalDismiss =
    opts?.call_push_kind === "call_canceled" ||
    opts?.call_push_kind === "call_rejected" ||
    opts?.call_push_kind === "call_ended" ||
    opts?.call_push_kind === "call_answered_elsewhere";

  if (!callPush && opts?.notification_event_id) {
    const { data: eventRow, error: eventError } = await svc
      .from("notification_events")
      .select("*")
      .eq("id", opts.notification_event_id)
      .eq("user_id", out.user_id)
      .maybeSingle();
    if (eventError || !eventRow) {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: "notification_event_not_found" },
        notification_event_id: opts.notification_event_id,
        environment: resolvePushEnvironment(),
      });
      return {
        ok: true,
        targets_found: 0,
        deliveries: audits,
        skipped_reason: "notification_event_not_found",
      };
    }
    const safety = await evaluateNotificationDeliverySafety(
      svc,
      eventRow as NotificationEventRow
    );
    if (!safety.allow) {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: safety.reason },
        notification_event_id: opts.notification_event_id,
        environment: resolvePushEnvironment(),
      });
      return {
        ok: true,
        targets_found: 0,
        deliveries: audits,
        skipped_reason: safety.reason,
      };
    }
  }

  if (!opts?.skip_settings_gate && !terminalDismiss) {
    const allowed = await shouldSendWebPushForUser(svc, enrichedOut.user_id, enrichedOut).catch(() => true);
    if (!allowed) {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        provider_response: { reason: "user_settings_gate" },
        notification_event_id: opts?.notification_event_id ?? null,
        environment: resolvePushEnvironment(),
      });
      console.info("[dispatchPushForUser] done — settings gate", { ...logCtx, deliveries: audits.length });
      return { ok: true, targets_found: 0, deliveries: audits };
    }
  }

  const loadedTargets = await loadActivePushTargets(svc, out.user_id, {
    fcmMode: "multi_device_fcm",
  });
  const targetDeviceId = opts?.target_device_id?.trim() ?? "";
  const targets = targetDeviceId
    ? loadedTargets.filter(
        (target) =>
          target.id === targetDeviceId ||
          String(target.device_id ?? "").trim() === targetDeviceId
      )
    : loadedTargets;
  console.info("[dispatchPushForUser] targets loaded", {
    ...logCtx,
    targets_found: targets.length,
    fcmMode: "multi_device_fcm",
  });

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

  const hasNativeCallTarget = targets.some(
    (t) => t.push_provider === "fcm" || t.push_provider === "voip_apns"
  );

  for (const target of targets) {
    if (callPush) {
      const decision = resolveCallPushProviderPolicy({
        callPushKind: opts?.call_push_kind ?? null,
        provider: target.push_provider,
        hasNativeCallTarget,
      });

      // VoIP(PushKit) 결정은 유령 재전화 회귀 추적을 위해 항상 관측한다(raw token 미기록).
      if (target.push_provider === "voip_apns") {
        console.info(
          decision.allow
            ? "[DIBAY_CALL_PUSH] call_push_provider_allowed"
            : "[DIBAY_CALL_PUSH] call_push_provider_skipped",
          {
            kind: opts?.call_push_kind ?? null,
            provider: "voip_apns",
            ...(decision.reason ? { reason: decision.reason } : {}),
            sessionId: callIdFromOutput(enrichedOut),
            recipientUserId: out.user_id,
            targetId: tokenPrefix(target),
          }
        );
      }

      if (!decision.allow) {
        await auditDelivery(svc, audits, {
          user_id: out.user_id,
          device_id: deviceIdForDelivery(target),
          event_type: eventType,
          target_type: opts?.target_type ?? null,
          target_id: opts?.target_id ?? null,
          status: "skipped",
          provider_response: { reason: decision.reason ?? "call_push_provider_disallowed" },
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
      provider_response: baseDeliveryDiagnostics(target, enrichedOut, opts),
      notification_event_id: opts?.notification_event_id ?? null,
      environment: target.environment ?? resolvePushEnvironment(),
    });

    if (!deliveryId && opts?.notification_event_id) {
      audits.push({
        id: null,
        status: "skipped",
        event_type: eventType,
        device_id: deviceIdForDelivery(target),
        push_provider: target.push_provider,
        provider_response: {
          ...baseDeliveryDiagnostics(target, enrichedOut, opts),
          reason: "duplicate_delivery",
        },
      });
      continue;
    }

    const result = await sendToTarget(target, enrichedOut, opts);

    const providerResponse = {
      ...baseDeliveryDiagnostics(target, enrichedOut, opts),
      ...(result.provider_response ?? {}),
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

    const responseCallId =
      typeof providerResponse.callId === "string" ? providerResponse.callId : callIdFromOutput(enrichedOut);
    if (
      result.status === "sent" &&
      target.push_provider === "fcm" &&
      opts?.call_push_kind === "incoming_call" &&
      responseCallId
    ) {
      scheduleMissingNativeAckDiagnostic({
        svc,
        deliveryId,
        callId: responseCallId,
        recipientUserId: out.user_id,
        sentAt: new Date().toISOString(),
        tokenPrefix: tokenPrefix(target),
      });
    }

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
