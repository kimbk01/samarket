import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

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
  /** Skip user settings gate (system/cancel dismiss only) */
  skip_settings_gate?: boolean;
  /** Admin test — bypass PUSH_DISPATCH_ENABLED gate and always audit-log attempts */
  force_dispatch?: boolean;
  /** notification_events SSOT badge total for FCM setNumber */
  badge_count?: number;
  /** notification_events row id — native 10s dedupe */
  notification_event_id?: string;
};

export type DispatchDeliveryAudit = {
  id: string | null;
  status: DeliveryStatus;
  event_type: string;
  device_id: string | null;
  push_provider?: string | null;
  provider_response?: Record<string, unknown> | null;
};

export type DispatchPushResult = {
  ok: boolean;
  targets_found: number;
  deliveries: DispatchDeliveryAudit[];
  skipped_reason?: string;
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
 * PASS (Jul 11 / pre-`da5ad3fdb`): `call_canceled`/`call_rejected`/`call_ended` 도
 * `voip_apns` 로 전달되어 `VoIPPushRegistry` → `reportCallEnded` 가 CallKit 을 dismiss 했다.
 * `da5ad3fdb` 가 VoIP terminal 을 전면 차단하면서 tracked dismiss 가 끊겼다.
 *
 * Ghost redial 방지(orphan → 신규 incoming 금지 / tracked UUID 만 종료)는
 * 기존 `VoIPPushRegistry`·`CallKitProvider` 분기가 담당한다 — 서버에서 VoIP terminal 을
 * 막지 않는다. web_push 의 native 우선(incoming/missed) 정책만 유지한다.
 */
export function resolveCallPushProviderPolicy(input: {
  callPushKind: DispatchPushOptions["call_push_kind"] | null | undefined;
  provider: PushProvider;
  hasNativeCallTarget: boolean;
}): CallPushProviderDecision {
  const terminalDismiss = isTerminalDismissCallPushKind(input.callPushKind);

  if (input.provider === "voip_apns") {
    // Restore pre-da5ad3fdb: terminal dismiss must reach VoIPPushRegistry for CallKit end.
    return { allow: true };
  }

  if (input.provider === "web_push") {
    // incoming/missed 은 native(voip/fcm) 가 있으면 web 중복 착신을 막는다(기존 정책).
    if (!terminalDismiss && input.hasNativeCallTarget) {
      return { allow: false, reason: "native_call_preferred" };
    }
    return { allow: true };
  }

  return { allow: true };
}
