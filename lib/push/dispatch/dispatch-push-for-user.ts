import { normalizeApnsEnvironment, rememberDeviceApnsEnvironment } from "@/lib/push/dispatch/apns-environment";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { shouldSendWebPushForUser } from "@/lib/notifications/web-push-user-settings-gate";
import { sendApnsToTarget, sendVoipApnsToTarget } from "@/lib/push/dispatch/apns-sender";
import { deactivateFailedPushTarget } from "@/lib/push/dispatch/deactivate-failed-token";
import { sendFcmToTarget } from "@/lib/push/dispatch/fcm-sender";
import {
  insertNotificationDelivery,
  insertNotificationDeliveryDetailed,
  isPermanentPushFailureResponse,
  loadActivePushTargets,
  reclaimNotificationDeliveryForRetry,
} from "@/lib/push/dispatch/load-active-push-targets";
import {
  isCallPush,
  resolveCallPushKindForProviderPolicy,
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

const CALL_PUSH_PROVIDER_PRIORITY: Record<string, number> = { voip_apns: 0, fcm: 1 };

/** 안정 정렬 — voip_apns → fcm → 그 외(apns 알림·web_push), 같은 순위는 기존 순서 유지 */
export function orderCallPushTargetsNativeFirst<T extends Pick<PushTarget, "push_provider">>(targets: T[]): T[] {
  return targets
    .map((target, index) => ({ target, index }))
    .sort((a, b) => {
      const pa = CALL_PUSH_PROVIDER_PRIORITY[String(a.target.push_provider)] ?? 2;
      const pb = CALL_PUSH_PROVIDER_PRIORITY[String(b.target.push_provider)] ?? 2;
      return pa - pb || a.index - b.index;
    })
    .map((entry) => entry.target);
}

/**
 * 통화 통합 설계 §2-1 (docs/audit/messenger-2026-10-22-call-integrated-design.md) — iPhone 통화 채널 발송 규칙.
 * iOS 규칙: VoIP 를 받은 앱은 매번 CallKit 에 새 통화를 보고해야 하고, 보고 없이 끝내는 일이 반복되면 iOS 가
 * 앱의 VoIP 를 폐기한다(2026-10-22 `dropped on the floor`). 그래서 VoIP 는 「CallKit 에 살아 있는 벨」이 있는
 * 기기에만 보내고, CallKit 이 통화를 표시하는 iPhone 에는 일반 알림(띵·배너)을 겹쳐 보내지 않는다.
 *  - voip_apns: incoming_call → 전송 / 종료류(canceled·rejected·ended·answered_elsewhere) → 이번 세션 벨 VoIP 가
 *    sent 된 기기만, 행동·받은 기기 제외 / missed_call → 전송 안 함(앱 자체 벨 타임아웃이 CallKit 을 끝냄)
 *  - apns(일반 알림): missed_call → 유지 / 그 외 → 같은 기기에 voip_apns 대상이 있으면 생략
 *    (incoming_call 은 그 VoIP 가 sent 일 때만 생략 — VoIP 실패 시 배너가 대체 수단)
 */
const IOS_CALL_TERMINAL_KINDS = new Set(["call_canceled", "call_rejected", "call_ended", "call_answered_elsewhere"]);

export type IosCallTargetDecision = { skip: false } | { skip: true; reason: string };

export function decideIosCallTarget(input: {
  provider: string;
  callPushKind: string | null | undefined;
  targetId: string;
  deviceId: string | null | undefined;
  /** 이번 세션 벨 VoIP 가 sent 된 user_devices 행 id. null = 조회 실패/모름(기존대로 전송) */
  ringDeliveredTargetIds: ReadonlySet<string> | null;
  iosExcludedDeviceIds: ReadonlySet<string>;
  voipTargetDeviceIds: ReadonlySet<string>;
  voipSentDeviceIds: ReadonlySet<string>;
}): IosCallTargetDecision {
  const kind = input.callPushKind ?? "";
  if (!kind) return { skip: false };
  const deviceId = String(input.deviceId ?? "").trim();
  if (input.provider === "voip_apns") {
    if (kind === "missed_call") return { skip: true, reason: "ios_voip_missed_local_timeout" };
    if (IOS_CALL_TERMINAL_KINDS.has(kind)) {
      if (deviceId && input.iosExcludedDeviceIds.has(deviceId)) {
        return { skip: true, reason: "ios_voip_actor_or_answered_device" };
      }
      if (input.ringDeliveredTargetIds && !input.ringDeliveredTargetIds.has(input.targetId)) {
        return { skip: true, reason: "ios_voip_no_live_ring" };
      }
    }
    return { skip: false };
  }
  if (input.provider === "apns") {
    if (kind === "missed_call") return { skip: false };
    if (!deviceId || !input.voipTargetDeviceIds.has(deviceId)) return { skip: false };
    if (kind === "incoming_call" && !input.voipSentDeviceIds.has(deviceId)) return { skip: false };
    return { skip: true, reason: "ios_callkit_owns_call" };
  }
  return { skip: false };
}

async function loadVoipRingDeliveredTargetIds(
  svc: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  sessionId: string
): Promise<Set<string> | null> {
  try {
    const { data, error } = await svc
      .from("notification_deliveries")
      .select("device_id, provider_response")
      .eq("target_type", "call_session")
      .eq("target_id", sessionId)
      .eq("event_type", "call_ringing")
      .eq("status", "sent");
    if (error || !Array.isArray(data)) return null;
    const ids = new Set<string>();
    for (const row of data as Array<{ device_id?: string | null; provider_response?: Record<string, unknown> | null }>) {
      const provider = String(row.provider_response?.push_provider ?? row.provider_response?.provider ?? "");
      const id = String(row.device_id ?? "").trim();
      if (provider === "voip_apns" && id) ids.add(id);
    }
    return ids;
  } catch {
    return null;
  }
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
  const logCtx = {
    user_id: out.user_id,
    force,
    event_type: eventType,
    target_type: opts?.target_type ?? null,
    call_push_kind: opts?.call_push_kind ?? null,
    target_id: opts?.target_id ?? null,
    notification_event_id: opts?.notification_event_id ?? null,
  };

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
    // CD-1: outer safety net — unexpected gate rejection must not fail-open to send.
    // Optional READ_FAILED is handled inside shouldSendWebPushForUser (returns false).
    // Mandatory READ_FAILED is preserved there (returns true) before this catch.
    const allowed = await shouldSendWebPushForUser(svc, enrichedOut.user_id, enrichedOut).catch(
      () => false
    );
    if (!allowed) {
      await auditDelivery(svc, audits, {
        user_id: out.user_id,
        event_type: eventType,
        target_type: opts?.target_type ?? null,
        target_id: opts?.target_id ?? null,
        status: "skipped",
        // Existing taxonomy — covers OFF prefs and preference authority failure.
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
    environment: opts?.push_environment,
  });
  const targetDeviceId = opts?.target_device_id?.trim() ?? "";
  const deviceScopedTargets = targetDeviceId
    ? loadedTargets.filter(
        (target) =>
          target.id === targetDeviceId ||
          String(target.device_id ?? "").trim() === targetDeviceId
      )
    : loadedTargets;
  const excludedDeviceIds = new Set(
    (opts?.exclude_device_ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
  );
  const scopedTargets = excludedDeviceIds.size
    ? deviceScopedTargets.filter((target) => !excludedDeviceIds.has(String(target.device_id ?? "").trim()))
    : deviceScopedTargets;
  if (scopedTargets.length !== deviceScopedTargets.length) {
    console.info("[dispatchPushForUser] targets excluded by device", {
      ...logCtx,
      excluded: deviceScopedTargets.length - scopedTargets.length,
    });
  }
  /**
   * 통화 푸시는 네이티브 통화 채널(voip_apns·fcm)을 먼저 보낸다. 대상은 last_seen_at 순이라 같은 iPhone 의
   * 알림(apns) 행이 앞서면 VoIP 가 그 전송 뒤로 밀려 임계경로 예산(2s)을 넘기고, 발신 취소 뒤에야 링이
   * 나가거나 유실됐다(2026-10-22 운영: VoIP 1.3~14.5s 지연·2건 미발송 / 10-20 VoIP 선행 0.5~0.7s).
   */
  const targets = callPush ? orderCallPushTargetsNativeFirst(scopedTargets) : scopedTargets;
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
  // SRV-01 retry ledger (non-call event pushes only; call pushes keep the legacy path).
  let alreadySentCount = 0;
  let retryPendingCount = 0;
  /** 통화 통합 설계 §2-1 — iPhone 통화 채널 판단 입력 */
  const dispatchCallPushKind = callPush ? resolveCallPushKindForProviderPolicy(enrichedOut, opts) : null;
  const iosExcludedDeviceIds = new Set(
    (opts?.ios_call_exclude_device_ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
  );
  const voipTargetDeviceIds = new Set(
    targets
      .filter((t) => t.push_provider === "voip_apns")
      .map((t) => String(t.device_id ?? "").trim())
      .filter(Boolean)
  );
  const voipSentDeviceIds = new Set<string>();
  const callSessionId = String(opts?.target_id ?? "").trim();
  const ringDeliveredTargetIds =
    dispatchCallPushKind &&
    IOS_CALL_TERMINAL_KINDS.has(dispatchCallPushKind) &&
    voipTargetDeviceIds.size > 0 &&
    opts?.target_type === "call_session" &&
    callSessionId
      ? await loadVoipRingDeliveredTargetIds(svc, callSessionId)
      : null;

  for (const target of targets) {
    // SSOT: always gate voip_apns (even for non-call). Call web_push policy only when callPush.
    const callPushKind = resolveCallPushKindForProviderPolicy(enrichedOut, opts);
    if (target.push_provider === "voip_apns" || callPush) {
      const decision = resolveCallPushProviderPolicy({
        callPushKind,
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
            kind: callPushKind,
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

    if (dispatchCallPushKind && (target.push_provider === "voip_apns" || target.push_provider === "apns")) {
      const iosDecision = decideIosCallTarget({
        provider: target.push_provider,
        callPushKind: dispatchCallPushKind,
        targetId: target.id,
        deviceId: target.device_id,
        ringDeliveredTargetIds,
        iosExcludedDeviceIds,
        voipTargetDeviceIds,
        voipSentDeviceIds,
      });
      if (iosDecision.skip) {
        console.info("[DIBAY_CALL_PUSH] ios_call_target_skipped", {
          kind: dispatchCallPushKind,
          provider: target.push_provider,
          reason: iosDecision.reason,
          sessionId: callIdFromOutput(enrichedOut),
          targetId: tokenPrefix(target),
        });
        await auditDelivery(svc, audits, {
          user_id: out.user_id,
          device_id: deviceIdForDelivery(target),
          event_type: eventType,
          target_type: opts?.target_type ?? null,
          target_id: opts?.target_id ?? null,
          status: "skipped",
          provider_response: { reason: iosDecision.reason },
          push_provider: target.push_provider,
        });
        continue;
      }
    }

    const insertResult = await insertNotificationDeliveryDetailed(svc, {
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
    let deliveryId: string | null = insertResult.kind === "inserted" ? insertResult.id : null;
    let deliveryAttempt: number | null = null;

    if (!deliveryId && opts?.notification_event_id) {
      const skipAudit = (reason: string) =>
        audits.push({
          id: null,
          status: "skipped",
          event_type: eventType,
          device_id: deviceIdForDelivery(target),
          push_provider: target.push_provider,
          provider_response: {
            ...baseDeliveryDiagnostics(target, enrichedOut, opts),
            reason,
          },
        });
      const deviceId = deviceIdForDelivery(target);
      if (callPush || !deviceId) {
        // Call pushes (incl. missed call) keep the pre-SRV-01 behaviour untouched.
        skipAudit("duplicate_delivery");
        continue;
      }
      if (insertResult.kind === "error") {
        // A DB hiccup is not a duplicate: do not send untracked, let the handoff retry.
        retryPendingCount += 1;
        skipAudit("delivery_insert_error");
        continue;
      }
      const reclaim = await reclaimNotificationDeliveryForRetry(svc, {
        notification_event_id: opts.notification_event_id,
        device_id: deviceId,
        provider_response: baseDeliveryDiagnostics(target, enrichedOut, opts),
      });
      if (reclaim.kind === "reclaimed") {
        deliveryId = reclaim.id;
        deliveryAttempt = reclaim.attempt;
        console.info("[dispatchPushForUser] delivery_retry_reclaimed", {
          ...logCtx,
          deliveryId,
          attempt: reclaim.attempt,
        });
      } else if (reclaim.kind === "already_sent") {
        alreadySentCount += 1;
        skipAudit("already_sent");
        continue;
      } else if (reclaim.kind === "in_flight") {
        retryPendingCount += 1;
        skipAudit("delivery_in_flight");
        continue;
      } else if (reclaim.kind === "permanent") {
        skipAudit("previous_permanent_failure");
        continue;
      } else if (reclaim.kind === "error") {
        retryPendingCount += 1;
        skipAudit("delivery_reclaim_error");
        continue;
      } else {
        skipAudit("duplicate_delivery");
        continue;
      }
    }

    const result = await sendToTarget(target, enrichedOut, opts);
    if (target.push_provider === "voip_apns" && result.status === "sent") {
      const voipDeviceId = String(target.device_id ?? "").trim();
      if (voipDeviceId) voipSentDeviceIds.add(voipDeviceId);
    }

    const providerResponse = {
      ...baseDeliveryDiagnostics(target, enrichedOut, opts),
      ...(result.provider_response ?? {}),
      ...(result.error_message ? { error: result.error_message } : {}),
      ...(deliveryAttempt ? { delivery_attempt: deliveryAttempt } : {}),
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

    // PUSH-02 — learn the token's APNs environment once (reported, or proven by the host that
    // accepted it) so the next alert goes straight to the right host. Alert only; VoIP unchanged.
    const provenApnsEnv = normalizeApnsEnvironment(result.provider_response?.apns_environment);
    if (
      result.status === "sent" &&
      target.push_provider === "apns" &&
      target.source === "user_devices" &&
      provenApnsEnv &&
      provenApnsEnv !== target.apns_environment
    ) {
      await rememberDeviceApnsEnvironment(svc, target.id, provenApnsEnv);
    }

    if (shouldDeactivateTarget(result, target)) {
      const reason = result.provider_response?.gone === true ? "gone" : "failed";
      await deactivateFailedPushTarget(svc, target, reason);
    }
    // WP-7 PUSH: 과거엔 web_push 가 어떤 실패든(일시적 500/네트워크/VAPID설정) 구독을
    // 비활성화해 건강한 구독이 영구 소실됐다. 진짜 종료(404/410=gone, subscription_gone)만
    // shouldDeactivateTarget 이 처리하고, 일시적 실패는 비활성화하지 않는다.
  }

  // NOTI-05: ok:true 는 "함수가 완료됨"일 뿐 전달 성공이 아니다. audits 로 실제 결과를 분류한다.
  const sentCount = audits.filter((a) => a.status === "sent").length;
  const failedAudits = audits.filter((a) => a.status === "failed");
  const allFailedPermanent =
    failedAudits.length > 0 &&
    failedAudits.every(
      (a) =>
        (a.provider_response as { bad_device_token?: boolean; gone?: boolean } | null)
          ?.bad_device_token === true ||
        (a.provider_response as { bad_device_token?: boolean; gone?: boolean } | null)?.gone === true
    );
  let outcome: "sent" | "noop" | "retryable" | "permanent";
  if (callPush || !opts?.notification_event_id) {
    // Legacy classification — call pushes and untracked pushes are unchanged.
    if (targets.length === 0) outcome = "noop";
    else if (sentCount > 0) outcome = "sent";
    else if (failedAudits.length === 0) outcome = "noop"; // skipped 만 존재
    else if (allFailedPermanent) outcome = "permanent";
    else outcome = "retryable";
  } else {
    // SRV-01: a device that failed transiently (or is still in flight) keeps the event retryable
    // even when another device succeeded; already-sent devices are never resent on retry.
    const retryableFailures = failedAudits.filter(
      (a) => !isPermanentPushFailureResponse(a.provider_response as Record<string, unknown> | null)
    ).length;
    if (targets.length === 0) outcome = "noop";
    else if (retryableFailures > 0 || retryPendingCount > 0) outcome = "retryable";
    else if (sentCount > 0 || alreadySentCount > 0) outcome = "sent";
    else if (failedAudits.length === 0) outcome = "noop";
    else outcome = "permanent";
  }

  console.info("[dispatchPushForUser] done", {
    ...logCtx,
    targets_found: targets.length,
    deliveries: audits.length,
    statuses: audits.map((d) => d.status),
    outcome,
  });

  return { ok: true, outcome, targets_found: targets.length, deliveries: audits };
}
