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
  target_type?: string | null;
  target_id?: string | null;
  /** Call-specific: incoming_call | missed_call | call_canceled */
  call_push_kind?: "incoming_call" | "missed_call" | "call_canceled";
  /** Skip user settings gate (system/cancel dismiss only) */
  skip_settings_gate?: boolean;
  /** Admin test — bypass PUSH_DISPATCH_ENABLED gate and always audit-log attempts */
  force_dispatch?: boolean;
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
  return nt || "notification";
}

export function isCallPush(out: NotificationSideEffectPayloadOut, opts?: DispatchPushOptions): boolean {
  if (opts?.call_push_kind) return true;
  const nt = String(out.notification_type ?? "");
  return nt === "community_messenger_incoming_call" || nt === "community_messenger_missed_call";
}
