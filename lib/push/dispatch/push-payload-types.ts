import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { PushEnvironment } from "@/lib/push/push-environment";
import type { ApnsEnvironment } from "@/lib/push/dispatch/apns-environment";

export type PushProvider = "fcm" | "apns" | "voip_apns" | "web_push";

export type PushPlatform = "android" | "ios" | "web" | "pwa";

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export type PushTargetSource = "user_devices" | "web_push_subscriptions";

/** Unified push target — native user_devices + legacy web_push_subscriptions */
export type PushTarget = {
  id: string;
  source: PushTargetSource;
  push_provider: PushProvider;
  push_token: string;
  platform: PushPlatform;
  device_id?: string | null;
  environment?: PushEnvironment;
  /** PUSH-02 — APNs sandbox/production of this token (apns only; null = unknown → server default). */
  apns_environment?: ApnsEnvironment | null;
  /** Web Push VAPID keys (web_push only) */
  key_p256dh?: string;
  key_auth?: string;
  endpoint?: string;
};

export type DispatchPushOptions = {
  event_type?: string;
  /** Explicit SSOT eventKey when event_type alone is insufficient */
  event_key?: string;
  target_type?: string | null;
  target_id?: string | null;
  /** Call-specific: incoming_call | missed_call | terminal dismiss signals. */
  call_push_kind?:
    | "incoming_call"
    | "missed_call"
    | "call_canceled"
    | "call_rejected"
    | "call_ended"
    | "call_answered_elsewhere";
  /**
   * iOS VoIP 종료 신호(call_rejected·call_answered_elsewhere)에서 뺄 기기 — 거절한 기기·받은 기기
   * (`user_devices.device_id`). 비어 있으면 그 kind 의 VoIP 는 보내지 않는다(통화 재감사 §4-3 A1).
   */
  ios_voip_terminal_exclude_device_ids?: readonly string[];
  /** Skip user settings gate (system/cancel dismiss only) */
  skip_settings_gate?: boolean;
  /** Admin test — bypass PUSH_DISPATCH_ENABLED gate and always audit-log attempts */
  force_dispatch?: boolean;
  /** Admin test/device diagnostics — restrict dispatch to one registered device. */
  target_device_id?: string;
  /** notification_events SSOT badge total for FCM setNumber */
  badge_count?: number;
  /** notification_events row id — native 10s dedupe */
  notification_event_id?: string;
  /** Override device environment filter (admin campaign → production member devices). */
  push_environment?: PushEnvironment;
};

export type DispatchDeliveryAudit = {
  id: string | null;
  status: DeliveryStatus;
  event_type: string;
  device_id: string | null;
  push_provider?: string | null;
  provider_response?: Record<string, unknown> | null;
};

/** NOTI-05: 배달 집계 결과 분류. handoff 상태 정합에 사용. */
export type DispatchPushOutcome = "sent" | "noop" | "retryable" | "permanent";

export type DispatchPushResult = {
  ok: boolean;
  targets_found: number;
  deliveries: DispatchDeliveryAudit[];
  skipped_reason?: string;
  /** NOTI-05: ok 는 "함수가 돌았다"일 뿐 전달 성공이 아니다. 실제 전달 결과는 outcome 으로 분류한다. */
  outcome?: DispatchPushOutcome;
};

export type SendPushResult = {
  status: DeliveryStatus;
  provider_response?: Record<string, unknown> | null;
  error_message?: string | null;
};

export type BuiltPushPayload = {
  json: string;
  data: Record<string, unknown>;
  is_call: boolean;
};

export function resolveEventType(out: NotificationSideEffectPayloadOut, opts?: DispatchPushOptions): string {
  if (opts?.event_type?.trim()) return opts.event_type.trim();
  const nt = String(out.notification_type ?? "").trim();
  if (nt === "community_messenger_incoming_call") return "call_ringing";
  if (nt === "community_messenger_missed_call") return "missed_call";
  if (opts?.call_push_kind === "call_canceled") return "call_cancel";
  if (opts?.call_push_kind === "call_rejected") return "call_reject";
  if (opts?.call_push_kind === "call_ended") return "call_end";
  if (opts?.call_push_kind === "call_answered_elsewhere") return "call_answered_elsewhere";
  return nt || "notification";
}

export function isCallPush(out: NotificationSideEffectPayloadOut, opts?: DispatchPushOptions): boolean {
  if (opts?.call_push_kind) return true;
  const nt = String(out.notification_type ?? "");
  return nt === "community_messenger_incoming_call" || nt === "community_messenger_missed_call";
}

/**
 * Canonical call_push_kind for provider routing.
 * CONTRACT: VoIP/PushKit may only be used when this returns a non-null kind.
 * DO NOT invent `incoming_call` for admin/chat/notice payloads.
 */
export function resolveCallPushKindForProviderPolicy(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): NonNullable<DispatchPushOptions["call_push_kind"]> | null {
  if (opts?.call_push_kind) return opts.call_push_kind;
  const nt = String(out.notification_type ?? "").trim();
  if (nt === "community_messenger_incoming_call") return "incoming_call";
  if (nt === "community_messenger_missed_call") return "missed_call";
  return null;
}

const TERMINAL_DISMISS_CALL_PUSH_KINDS: ReadonlySet<NonNullable<DispatchPushOptions["call_push_kind"]>> = new Set([
  "call_canceled",
  "call_rejected",
  "call_ended",
  "call_answered_elsewhere",
]);

/** Call kinds that must fan out to every eligible mobile device (one FCM per device_id). */
export function isMultiDeviceCallPushKind(
  kind: DispatchPushOptions["call_push_kind"] | null | undefined,
): boolean {
  if (!kind) return false;
  return (
    kind === "incoming_call" ||
    kind === "call_canceled" ||
    kind === "call_rejected" ||
    kind === "call_ended" ||
    kind === "call_answered_elsewhere"
  );
}

/** call_ended / call_rejected / call_canceled — 이미 끝난 통화의 UI 정리용 dismiss 신호. */
export function isTerminalDismissCallPushKind(
  kind: DispatchPushOptions["call_push_kind"] | null | undefined
): boolean {
  return kind != null && TERMINAL_DISMISS_CALL_PUSH_KINDS.has(kind);
}

export type CallPushProviderDecision = { allow: boolean; reason?: string };

/**
 * (call_push_kind, provider) 별 명시적 라우팅 정책 — SSOT.
 *
 * iOS VoIP(A1 · docs/audit/messenger-2026-10-22-reaudit-plan.md §4-3):
 * 이미 CallKit 이 끝났을 수 있는 iPhone 에 VoIP 를 보내면 앱이 CallKit 보고 없이 완료하고
 * iOS 가 앱을 종료·VoIP 를 폐기한다(iOS 1.2 (7) `VoIPPushRegistry` completion_only).
 * - incoming_call · call_canceled: 벨 중인 기기에 필요 → 허용
 * - missed_call: iPhone 은 자체 벨 타이머로 이미 종료 → 차단
 * - call_ended: 연결 중 iPhone 은 미디어(상대 퇴장)로 종료 → 차단
 * - call_rejected · call_answered_elsewhere: 거절한 기기·받은 기기를 뺀 기기만.
 *   제외할 기기를 모르면(목록 없음·대상 device_id 없음) 보내지 않는다.
 * apns·fcm·web_push 는 바꾸지 않는다.
 */
export function resolveCallPushProviderPolicy(input: {
  callPushKind: DispatchPushOptions["call_push_kind"] | null | undefined;
  provider: PushProvider;
  hasNativeCallTarget: boolean;
  /** 대상 `user_devices.device_id` (voip_apns 종료 신호 제외 판정용). */
  targetDeviceId?: string | null;
  voipTerminalExcludeDeviceIds?: readonly string[] | null;
}): CallPushProviderDecision {
  const terminalDismiss = isTerminalDismissCallPushKind(input.callPushKind);

  if (input.provider === "voip_apns") {
    // CONTRACT: PushKit VoIP is call-authority only (incoming + terminal dismiss).
    // Admin/campaign/chat/notice MUST NOT fan out to voip_apns — that rings CallKit as a fake call.
    if (!input.callPushKind) {
      return { allow: false, reason: "voip_reserved_for_call_push" };
    }
    if (input.callPushKind === "missed_call") {
      return { allow: false, reason: "ios_voip_missed_call_local_ring_timeout" };
    }
    if (input.callPushKind === "call_ended") {
      return { allow: false, reason: "ios_voip_call_ended_media_owned" };
    }
    if (input.callPushKind === "call_rejected" || input.callPushKind === "call_answered_elsewhere") {
      const exclude = (input.voipTerminalExcludeDeviceIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
      if (!exclude.length) {
        return { allow: false, reason: "ios_voip_terminal_actor_device_unknown" };
      }
      const targetDeviceId = String(input.targetDeviceId ?? "").trim();
      if (!targetDeviceId) {
        return { allow: false, reason: "ios_voip_terminal_target_device_unknown" };
      }
      if (exclude.includes(targetDeviceId)) {
        return { allow: false, reason: "ios_voip_terminal_actor_or_answered_device" };
      }
    }
    return { allow: true };
  }

  if (input.provider === "web_push") {
    // Only apply native-preferred suppression for actual call pushes.
    if (!input.callPushKind) {
      return { allow: true };
    }
    // incoming/missed 은 native(voip/fcm) 가 있으면 web 중복 착신을 막는다(기존 정책).
    if (!terminalDismiss && input.hasNativeCallTarget) {
      return { allow: false, reason: "native_call_preferred" };
    }
    return { allow: true };
  }

  return { allow: true };
}
