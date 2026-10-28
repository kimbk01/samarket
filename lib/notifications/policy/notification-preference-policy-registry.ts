/**
 * P2-A2 — Canonical event + meta.kind preference policy SSOT.
 *
 * Provenance: P2-A1 policy hard lock (writers/meta kinds verified in audit).
 * Does NOT replace NOTIFICATION_EVENT_DEFINITIONS.
 */

import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  callAuthorityChannelPolicy,
  mandatoryChannelPolicy,
  marketingChannelPolicy,
  optionalOperationalChannelPolicy,
  socialChannelPolicy,
} from "@/lib/notifications/policy/notification-preference-policy-channel-presets";
import type {
  NotificationChannelPolicy,
  NotificationPolicyClass,
  NotificationPreferenceDomain,
  NotificationPreferencePolicy,
  NotificationPreferencePolicyLookupInput,
  NotificationPreferenceRecipientRole,
} from "@/lib/notifications/policy/notification-preference-policy-types";

type PolicyRow = Readonly<{
  recipientRole: NotificationPreferenceRecipientRole;
  preferenceDomain: NotificationPreferenceDomain;
  policyClass: NotificationPolicyClass;
  channelPolicy: NotificationChannelPolicy;
}>;

function row(
  recipientRole: NotificationPreferenceRecipientRole,
  preferenceDomain: NotificationPreferenceDomain,
  policyClass: NotificationPolicyClass,
  channelPolicy: NotificationChannelPolicy
): PolicyRow {
  return { recipientRole, preferenceDomain, policyClass, channelPolicy };
}

const OPTIONAL = optionalOperationalChannelPolicy();
const MANDATORY = mandatoryChannelPolicy();
const SOCIAL = socialChannelPolicy();
const MARKETING = marketingChannelPolicy();
const CALL_AUTHORITY = callAuthorityChannelPolicy();

/** Canonical default per notification_events.type (member-facing unless noted). */
export const CANONICAL_EVENT_PREFERENCE_POLICY: Readonly<
  Record<NotificationEventType, PolicyRow>
> = {
  chat_message: row("member", "community_chat", "optional_operational", OPTIONAL),
  group_message: row("member", "community_chat", "optional_operational", OPTIONAL),
  mention_message: row("member", "community_chat", "social", SOCIAL),
  pin_message: row("member", "community_chat", "social", SOCIAL),
  trade_message: row("member", "trade_chat", "optional_operational", OPTIONAL),
  store_order_message: row("member", "order_chat", "optional_operational", OPTIONAL),
  trade_status: row("member", "trade_events", "optional_operational", OPTIONAL),
  order_status: row("member", "order", "optional_operational", OPTIONAL),
  delivery_status: row("member", "order", "optional_operational", OPTIONAL),
  community_activity: row("member", "community_social", "social", SOCIAL),
  admin_marketing_banner: row("member", "marketing", "marketing", MARKETING),
  admin_notice: row("member", "notice", "optional_operational", OPTIONAL),
  notice_published: row("member", "notice", "optional_operational", OPTIONAL),
  inquiry_answered: row("member", "notice", "optional_operational", OPTIONAL),
  inbox_message_received: row("member", "notice", "optional_operational", OPTIONAL),
  support_case_created: row("member", "notice", "optional_operational", OPTIONAL),
  support_admin_replied: row("member", "notice", "optional_operational", OPTIONAL),
  support_customer_replied: row("member", "notice", "optional_operational", OPTIONAL),
  support_case_assigned: row("member", "notice", "optional_operational", OPTIONAL),
  support_case_resolved: row("member", "notice", "optional_operational", OPTIONAL),
  support_case_reopened: row("member", "notice", "optional_operational", OPTIONAL),
  admin_test: row("member", "system_test", "optional_operational", OPTIONAL),
  missed_call: row("member", "call", "optional_operational", OPTIONAL),
  incoming_call_signal: row("member", "call", "n_a", CALL_AUTHORITY),
};

/**
 * P2-A1 proven meta.kind overrides — exact writer literals only.
 * Takes precedence over canonical event defaults.
 */
export const META_KIND_PREFERENCE_POLICY_OVERRIDES: Readonly<Record<string, PolicyRow>> = {
  // Member financial (mandatory)
  user_point_charge_approved: row("member", "member_financial", "mandatory", MANDATORY),
  user_point_charge_rejected: row("member", "member_financial", "mandatory", MANDATORY),
  user_point_charge_on_hold: row("member", "member_financial", "mandatory", MANDATORY),

  // Owner financial (mandatory)
  store_point_charge_approved: row("owner", "owner_financial", "mandatory", MANDATORY),
  store_point_charge_rejected: row("owner", "owner_financial", "mandatory", MANDATORY),
  store_point_charge_on_hold: row("owner", "owner_financial", "mandatory", MANDATORY),
  store_point_deducted: row("owner", "owner_financial", "mandatory", MANDATORY),
  store_point_blocked: row("owner", "owner_financial", "mandatory", MANDATORY),

  // Owner financial / support (optional)
  store_point_low: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  store_point_account_replied: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),

  // Payment-critical order (mandatory)
  store_order_payment_completed_buyer: row("member", "order", "mandatory", MANDATORY),
  store_order_payment_completed: row("owner", "owner_order_ops", "mandatory", MANDATORY),
  store_order_payment_failed: row("member", "order", "mandatory", MANDATORY),
  store_order_refund_requested: row("owner", "owner_order_ops", "mandatory", MANDATORY),
  store_order_refund_approved: row("member", "order", "mandatory", MANDATORY),

  // Fulfillment / operational order (optional)
  store_order_owner_status: row("member", "order", "optional_operational", OPTIONAL),
  store_order_auto_completed: row("member", "order", "optional_operational", OPTIONAL),
  store_order_created: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  store_order_accept_reminder_30s: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  store_order_accept_reminder_60s: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  store_order_buyer_cancelled: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  // F9 (2026-10-28) — 오너 종류 누락분(수신 역할 owner 추론)
  store_order_accept_timeout_cancelled: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  store_order_sold_out: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),

  // SRV-03 — delivery-ad business cash (owner financial, mandatory)
  // Writers: lib/stores/advertising/delivery-ad-business-cash-charge-notify.ts
  delivery_ad_business_cash_charge_completed: row("owner", "owner_financial", "mandatory", MANDATORY),
  delivery_ad_business_cash_charge_rejected: row("owner", "owner_financial", "mandatory", MANDATORY),

  // SRV-03 — delivery-ad review / lifecycle / admin message to owner (operational, optional)
  // Writers: lib/stores/advertising/delivery-ad-operations-notification-map.ts
  delivery_ad_changes_requested: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_approved: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_rejected: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_paused_admin: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_resumed: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_terminated: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_ended: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  delivery_ad_admin_message: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),

  // Gift transfer lifecycle (writers: notify-gift-transfer.ts)
  // D-1 (재감사 P-13): 메신저 소속 → 「메신저 채팅」 설정. 선물 제안은 금융 필수 유지.
  gift_transfer_offered: row("member", "member_financial", "mandatory", MANDATORY),
  gift_transfer_accepted: row("member", "community_chat", "optional_operational", OPTIONAL),
  gift_transfer_rejected: row("member", "community_chat", "optional_operational", OPTIONAL),
  gift_transfer_cancelled: row("member", "community_chat", "optional_operational", OPTIONAL),

  // Messenger friend / group invite (writers: lib/community-messenger/service.ts) — D-1 메신저 소속.
  friend_request: row("member", "community_chat", "optional_operational", OPTIONAL),
  friend_accepted: row("member", "community_chat", "optional_operational", OPTIONAL),
  friend_rejected: row("member", "community_chat", "optional_operational", OPTIONAL),
  community_group_invite: row("member", "community_chat", "optional_operational", OPTIONAL),

  // D-Q4 (Owner 2026-10-28): 계정·거래·커뮤니티 제재, 내 콘텐츠·모임 운영 조치, 채팅 신고 제재 = 필수.
  // 신고자에게 가는 처리 결과·상단 고정·홍보는 일반(기존 유지).
  // Writers: notify-trade-moderation.ts · notify-community-moderation.ts · notify-chat-report-result.ts
  trade_moderation: row("member", "trade_events", "mandatory", MANDATORY),
  trade_sanction: row("member", "trade_events", "mandatory", MANDATORY),
  community_moderation: row("member", "community_social", "mandatory", MANDATORY),
  community_sanction: row("member", "community_social", "mandatory", MANDATORY),
  community_meeting_decision: row("member", "community_social", "mandatory", MANDATORY),
  chat_report_sanction: row("member", "notice", "mandatory", MANDATORY),
};

/**
 * D-Q3 (Owner 2026-10-28): 「매장·상점 알림」(user_notification_settings.store_enabled) 적용 범위 —
 * 관리자 매장 공지·매장 심사 결정·관리자 주문 개입·광고 심사/상태 알림. 필수(금융) 알림은 제외.
 */
export const STORE_SETTING_GOVERNED_META_KINDS: ReadonlySet<string> = new Set([
  "admin_store_operational_notice",
  "admin_store_decision",
  "admin_store_order_intervention",
  "delivery_ad_changes_requested",
  "delivery_ad_approved",
  "delivery_ad_rejected",
  "delivery_ad_paused_admin",
  "delivery_ad_resumed",
  "delivery_ad_terminated",
  "delivery_ad_ended",
  "delivery_ad_admin_message",
]);

/**
 * meta.kind + recipientRole when canonical meta kind alone is ambiguous.
 * Writers: store_order_message sets receiverRole in meta.
 */
export const META_KIND_RECIPIENT_PREFERENCE_POLICY_OVERRIDES: Readonly<
  Record<string, PolicyRow>
> = {
  "store_order_message:owner": row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  "store_order_message:member": row("member", "order_chat", "optional_operational", OPTIONAL),
  "store_order_message:user": row("member", "order_chat", "optional_operational", OPTIONAL),
};

/**
 * eventType + recipientRole when canonical event row default role differs.
 * inquiry_answered to store owner (notifyStoreOwnerPlatformInquiryReplied).
 */
export const EVENT_RECIPIENT_PREFERENCE_POLICY_OVERRIDES: Readonly<
  Partial<Record<NotificationEventType, Partial<Record<NotificationPreferenceRecipientRole, PolicyRow>>>>
> = {
  inquiry_answered: {
    owner: row("owner", "notice", "optional_operational", OPTIONAL),
  },
  store_order_message: {
    owner: row("owner", "owner_order_ops", "optional_operational", OPTIONAL),
  },
};

const SAFE_FALLBACK_POLICY: PolicyRow = row(
  "member",
  "order",
  "optional_operational",
  OPTIONAL
);

function metaKindRecipientKey(metaKind: string, recipientRole: string): string {
  return `${metaKind}:${recipientRole}`;
}

function normalizeMetaKind(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t.length > 0 ? t : null;
}

function normalizeEventType(value: string | null | undefined): NotificationEventType | null {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return null;
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(t)
    ? (t as NotificationEventType)
    : null;
}

function normalizeRecipientRole(
  value: string | null | undefined
): NotificationPreferenceRecipientRole | null {
  if (value === "member" || value === "owner" || value === "admin_ops") return value;
  return null;
}

function toPolicy(
  source: NotificationPreferencePolicy["resolutionSource"],
  entry: PolicyRow
): NotificationPreferencePolicy {
  return {
    recipientRole: entry.recipientRole,
    preferenceDomain: entry.preferenceDomain,
    policyClass: entry.policyClass,
    channelPolicy: entry.channelPolicy,
    resolutionSource: source,
  };
}

/**
 * Lookup priority (HARD LOCK):
 * 1. meta.kind + recipientRole composite override
 * 2. exact meta.kind override
 * 3. eventType + recipientRole override
 * 4. canonical event policy (when recipientRole matches or is omitted)
 * 5. safe fallback (never promotes unknown to mandatory)
 */
export function getNotificationPreferencePolicy(
  input: NotificationPreferencePolicyLookupInput
): NotificationPreferencePolicy {
  const metaKind = normalizeMetaKind(input.metaKind);
  const eventType = normalizeEventType(input.eventType);
  const recipientRole = normalizeRecipientRole(input.recipientRole);

  if (metaKind && recipientRole) {
    const composite = META_KIND_RECIPIENT_PREFERENCE_POLICY_OVERRIDES[
      metaKindRecipientKey(metaKind, recipientRole)
    ];
    if (composite) {
      return toPolicy("meta_kind_recipient_override", composite);
    }
  }

  if (metaKind) {
    const metaOverride = META_KIND_PREFERENCE_POLICY_OVERRIDES[metaKind];
    if (metaOverride) {
      return toPolicy("meta_kind_override", metaOverride);
    }
  }

  if (eventType && recipientRole) {
    const eventRecipient = EVENT_RECIPIENT_PREFERENCE_POLICY_OVERRIDES[eventType]?.[recipientRole];
    if (eventRecipient) {
      return toPolicy("event_recipient_override", eventRecipient);
    }
  }

  if (eventType) {
    const canonical = CANONICAL_EVENT_PREFERENCE_POLICY[eventType];
    if (canonical) {
      if (!recipientRole || recipientRole === canonical.recipientRole) {
        return toPolicy("canonical_event", canonical);
      }
    }
  }

  return toPolicy("safe_fallback", SAFE_FALLBACK_POLICY);
}

/** True when policy class is mandatory (excludes n_a). */
export function isMandatoryPreferencePolicy(policy: NotificationPreferencePolicy): boolean {
  return policy.policyClass === "mandatory";
}

/** Policy contract: push_kind === system is NOT mandatory unless explicitly overridden later. */
export function isSystemPushKindMandatoryByPolicy(_pushKind: string | null | undefined): boolean {
  return false;
}

export function listCanonicalEventTypesWithPreferencePolicy(): readonly NotificationEventType[] {
  return NOTIFICATION_EVENT_TYPES;
}

export function listMetaKindPreferencePolicyOverrides(): readonly string[] {
  return Object.keys(META_KIND_PREFERENCE_POLICY_OVERRIDES);
}
