/**
 * P2-A2 — Recipient-aware delivery preference policy types.
 *
 * ROLE BOUNDARY (do not collapse with event registry):
 * - `notification-event-registry.ts` = event identity / product classification / bell routing metadata
 * - This module = delivery preference policy (push/sound/DND semantics for future resolver)
 *
 * Runtime consumers MUST NOT import this module until P2-A3 resolver cutover.
 */

import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";

/** Who receives the notification for preference resolution. */
export type NotificationPreferenceRecipientRole = "member" | "owner" | "admin_ops";

/** Semantic preference domain — NOT raw DB column names. */
export type NotificationPreferenceDomain =
  | "community_chat"
  | "trade_chat"
  | "order_chat"
  | "trade_events"
  | "order"
  | "community_social"
  | "notice"
  | "marketing"
  | "member_financial"
  | "owner_financial"
  | "owner_order_ops"
  | "call"
  | "system_test"
  | "admin_ops_sound";

export type NotificationPolicyClass =
  | "mandatory"
  | "optional_operational"
  | "social"
  | "marketing"
  | "n_a";

export type NotificationChannelDisposition =
  | "always"
  | "user_configurable"
  | "suppressed"
  | "na";

export type NotificationDndDisposition = "bypass_push_only" | "obey" | "na";

/** Per-channel delivery policy (P2-A1 channel semantics). */
export type NotificationChannelPolicy = Readonly<{
  inApp: NotificationChannelDisposition;
  badge: NotificationChannelDisposition;
  push: NotificationChannelDisposition;
  sound: NotificationChannelDisposition;
  vibration: NotificationChannelDisposition;
  dnd: NotificationDndDisposition;
}>;

export type NotificationPreferencePolicy = Readonly<{
  recipientRole: NotificationPreferenceRecipientRole;
  preferenceDomain: NotificationPreferenceDomain;
  policyClass: NotificationPolicyClass;
  channelPolicy: NotificationChannelPolicy;
  /** Which lookup tier produced this policy (audit / tests). */
  resolutionSource:
    | "meta_kind_override"
    | "meta_kind_recipient_override"
    | "event_recipient_override"
    | "canonical_event"
    | "safe_fallback";
}>;

export type NotificationPreferencePolicyLookupInput = Readonly<{
  eventType?: NotificationEventType | string | null;
  metaKind?: string | null;
  recipientRole?: NotificationPreferenceRecipientRole | null;
}>;
