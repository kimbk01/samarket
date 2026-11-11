/**
 * Member Notification Domain SSOT.
 *
 * ONE EVENT → ONE DOMAIN
 * Used by: tab filter, tab badge, row label (Bell + Full Inbox).
 * Destination remains resolveNotificationDestination / content board bind.
 */

export const MEMBER_NOTIFICATION_DOMAINS = [
  "notice",
  "delivery",
  "trade",
  "community",
  "marketing",
  "system",
  "support",
] as const;

export type MemberNotificationDomain = (typeof MEMBER_NOTIFICATION_DOMAINS)[number];

/**
 * INAPP-02 — API category param (list `push_kind`, mark-all `category`) → domain.
 * Empty / "all" → null (every category). Unknown → "invalid" (caller answers 400).
 */
export function parseMemberNotificationDomainParam(
  raw: unknown
): MemberNotificationDomain | null | "invalid" {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v || v === "all") return null;
  return (MEMBER_NOTIFICATION_DOMAINS as readonly string[]).includes(v)
    ? (v as MemberNotificationDomain)
    : "invalid";
}

export type MemberNotificationDomainRow = {
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
  campaign_type?: string | null;
  /** display_payload / row meta.kind — historical delivery_ad_* mis-bucket repair */
  meta_kind?: string | null;
};

/** Inbox row (list·group card·detail) — 분류 입력을 만드는 화면 밖 형태. */
export type MemberNotificationInboxRowLike = {
  push_kind?: string | null;
  notification_type?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
  campaign_type?: string | null;
  meta?: Record<string, unknown> | null;
  /** D-1 kind (legacyMeta → 최상위) — meta.kind 보다 우선. */
  event_kind?: string | null;
};

/**
 * P-4 (docs/audit/notification-full-reaudit-2026-10-27.md): 탭 목록·행 라벨·상세 상단 분류가 같은 입력을
 * 쓰도록 하는 단일 변환. 화면마다 필드를 골라 넘기면 kind 가 빠져 탭과 라벨이 갈린다.
 */
export function memberNotificationDomainRowFromInbox(
  row: MemberNotificationInboxRowLike
): MemberNotificationDomainRow {
  const meta = row.meta ?? null;
  return {
    push_kind: row.push_kind,
    notification_type: row.notification_type,
    type: row.notification_type,
    category: typeof meta?.category === "string" ? meta.category : null,
    event_type: row.event_type,
    bell_presentation_type: row.bell_presentation_type,
    campaign_type: row.campaign_type,
    meta_kind: row.event_kind || (typeof meta?.kind === "string" ? meta.kind : null),
  };
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function tokensOf(row: MemberNotificationDomainRow): Set<string> {
  return new Set(
    [
      norm(row.push_kind),
      norm(row.notification_type),
      norm(row.type),
      norm(row.category),
      norm(row.event_type),
      norm(row.bell_presentation_type),
      norm(row.campaign_type),
    ].filter(Boolean)
  );
}

/** 신고 처리·제재·게시물 조치 알림의 meta.kind — 고객센터 분야. */
export const SUPPORT_META_KINDS: ReadonlySet<string> = new Set([
  "chat_report_result",
  "chat_report_sanction",
  "community_report_processed",
  "trade_report_processed",
  "community_sanction",
  "trade_sanction",
  "community_moderation",
  "trade_moderation",
]);

function hasAny(tokens: Set<string>, keys: readonly string[]): boolean {
  return keys.some((k) => tokens.has(k));
}

/**
 * Classify a member inbox / event row into exactly one filter domain, or null
 * when it only belongs under 「전체」 (e.g. inquiry/inbox — not a member filter domain).
 */
export function classifyMemberNotificationDomain(
  row: MemberNotificationDomainRow
): MemberNotificationDomain | null {
  const tokens = tokensOf(row);
  const campaign = norm(row.campaign_type);
  const push = norm(row.push_kind);
  const bell = norm(row.bell_presentation_type);
  const event = norm(row.event_type) || norm(row.type);

  // Inquiry / direct message are Customer Center threads — never notice campaign domains.
  // Phase 3 A2 — Support Center (support_*) = same Customer Center thread rule as legacy inquiry.
  if (
    event === "inquiry_answered" ||
    event === "inbox_message_received" ||
    event.startsWith("support_") ||
    hasAny(tokens, ["inquiry_answered", "inbox_message_received", "member_admin_note"])
  ) {
    // 알림 최종 설계 §2-2 (Owner 승인 2026-11-01): 문의·고객센터·회원노트 = 「고객센터」 (이전 B-06 「시스템」).
    return "support";
  }

  // Delivery Ads ops / Cash charge — never Orders & delivery (historical writer bug).
  const metaKind = norm(row.meta_kind);
  // 알림 최종 설계 §2-2: 신고 처리 결과·운영 제재·게시물 조치 = 「고객센터」 (목적지 = 신고 내역·운영 안내).
  if (SUPPORT_META_KINDS.has(metaKind)) {
    return "support";
  }
  if (metaKind.startsWith("delivery_ad_")) {
    return "marketing";
  }
  // U-10 (2026-10-25): 메신저 친구 요청·수락 알림은 legacy notification_type "status" 로 기록되어
  // 아래 trade 규칙에 걸려 「거래」로 보였다 → meta.kind 로 커뮤니티에 고정.
  if (metaKind === "friend_request" || metaKind === "friend_accepted") {
    return "community";
  }
  // 모임(moim) 알림은 notification_type 과 관계없이 커뮤니티
  if (metaKind.startsWith("moim_")) {
    return "community";
  }
  // 알림 최종 설계 §2-2 (Owner 승인 2026-11-01): 회원 포인트 충전 결과 = 「주문·배달」 (이전 B-13 「시스템」).
  if (metaKind.startsWith("user_point_charge_")) {
    return "delivery";
  }

  // Explicit campaign / push / presentation win first (notice ≠ system).
  // Do not treat legacy inquiry payload campaignType=system as system bulletin.
  if (campaign === "marketing" || push === "marketing" || bell === "admin_marketing") {
    return "marketing";
  }
  if (campaign === "notice" || push === "notice" || bell === "admin_notice") {
    return "notice";
  }
  if (campaign === "system" || push === "system" || bell === "admin_system") {
    return "system";
  }

  if (
    hasAny(tokens, ["marketing", "admin_marketing", "admin_marketing_banner"]) ||
    event === "admin_marketing_banner"
  ) {
    return "marketing";
  }

  // notice_published defaults to notice unless campaignType/push already said system above.
  if (
    event === "notice_published" ||
    hasAny(tokens, ["notice", "admin_notice", "notice_persistent", "service_notice"])
  ) {
    return "notice";
  }

  if (
    hasAny(tokens, [
      "admin_system",
      "system_important",
      "security_alert",
      "system_persistent",
      "missed_call",
    ])
  ) {
    return "system";
  }

  if (
    hasAny(tokens, [
      "delivery",
      "commerce",
      "order_status",
      "delivery_status",
      "customer_order_status",
      "customer_order_message",
      "owner_order_status",
      "owner_order_message",
    ])
  ) {
    return "delivery";
  }

  if (hasAny(tokens, ["trade", "trade_status", "trade_message", "status"])) {
    return "trade";
  }

  if (hasAny(tokens, ["community", "community_activity"])) {
    return "community";
  }

  return null;
}

/** Row label presentation — domain tabs + customer-support thread labels. */
export function resolveMemberNotificationRowLabelKey(
  row: MemberNotificationDomainRow
):
  | "notif_filter_notice"
  | "notif_filter_delivery"
  | "notif_filter_trade"
  | "notif_filter_community"
  | "notif_filter_marketing"
  | "notif_filter_system"
  | "notif_filter_support"
  | "notif_label_inquiry_reply"
  | "notif_label_direct_message"
  | null {
  const event = norm(row.event_type) || norm(row.type);
  if (event === "inquiry_answered") return "notif_label_inquiry_reply";
  if (event === "inbox_message_received") return "notif_label_direct_message";
  const domain = classifyMemberNotificationDomain(row);
  if (!domain) return null;
  return memberNotificationDomainLabelKey(domain);
}

export function matchesMemberNotificationDomain(
  row: MemberNotificationDomainRow,
  domain: MemberNotificationDomain
): boolean {
  return classifyMemberNotificationDomain(row) === domain;
}

/** i18n message keys for domain row / tab labels. */
export function memberNotificationDomainLabelKey(
  domain: MemberNotificationDomain
):
  | "notif_filter_notice"
  | "notif_filter_delivery"
  | "notif_filter_trade"
  | "notif_filter_community"
  | "notif_filter_marketing"
  | "notif_filter_system"
  | "notif_filter_support" {
  switch (domain) {
    case "notice":
      return "notif_filter_notice";
    case "delivery":
      return "notif_filter_delivery";
    case "trade":
      return "notif_filter_trade";
    case "community":
      return "notif_filter_community";
    case "marketing":
      return "notif_filter_marketing";
    case "system":
      return "notif_filter_system";
    case "support":
      return "notif_filter_support";
  }
}

/**
 * 알림 최종 설계 §2-2 (Owner 승인 2026-11-01) — 종 분야 탭.
 * 「운영 소식」 = 공지 + 시스템(점검·장애·업데이트). 나머지는 분류 1개 = 탭 1개.
 */
export const NOTIFICATION_BELL_TABS = [
  "all",
  "ops",
  "delivery",
  "trade",
  "community",
  "marketing",
  "support",
] as const;

export type NotificationBellTab = (typeof NOTIFICATION_BELL_TABS)[number];

export function bellTabDomains(tab: NotificationBellTab): readonly MemberNotificationDomain[] | null {
  switch (tab) {
    case "all":
      return null;
    case "ops":
      return ["notice", "system"];
    default:
      return [tab];
  }
}

export function bellTabForDomain(domain: MemberNotificationDomain | null): Exclude<NotificationBellTab, "all"> | null {
  if (!domain) return null;
  if (domain === "notice" || domain === "system") return "ops";
  return domain;
}

/** 목록 `push_kind`·모두 읽음 `category` 값 → 종 탭. 「ops」 외에 기존 분류 이름도 받는다(구 요청 호환). */
export function parseNotificationBellTabParam(raw: unknown): NotificationBellTab | "invalid" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v === "all") return "all";
  if (v === "notice" || v === "system" || v === "ops") return "ops";
  return (NOTIFICATION_BELL_TABS as readonly string[]).includes(v) ? (v as NotificationBellTab) : "invalid";
}
