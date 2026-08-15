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
] as const;

export type MemberNotificationDomain = (typeof MEMBER_NOTIFICATION_DOMAINS)[number];

export type MemberNotificationDomainRow = {
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
  campaign_type?: string | null;
};

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

  // Explicit campaign / push / presentation win first (notice ≠ system).
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
  | "notif_filter_system" {
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
  }
}
