import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";

export type NotificationInboxVisualKind =
  | "notice"
  | "system"
  | "marketing"
  | "delivery"
  | "community"
  | "trade"
  | "cs"
  | "chat"
  | "default";

export type NotificationInboxVisual = {
  kind: NotificationInboxVisualKind;
  /** Soft circular icon well */
  wellClassName: string;
  iconClassName: string;
  /** Soft domain chip behind row label (mockup) */
  chipClassName: string;
};

/**
 * U-06 — sam 토큰만 사용 (hex 금지). 분류별 구분: 공지·시스템 = 중립, 거래·채팅 = 브랜드 그린,
 * 커뮤니티 = success, 배달 = warning, 마케팅 = gold. 칩 글자는 대비 확보를 위해 fg/primary/success 만.
 */
const VISUALS: Readonly<Record<NotificationInboxVisualKind, NotificationInboxVisual>> = {
  notice: {
    kind: "notice",
    wellClassName: "bg-sam-surface-muted",
    iconClassName: "text-sam-primary",
    chipClassName: "bg-sam-surface-muted text-sam-fg",
  },
  system: {
    kind: "system",
    wellClassName: "bg-sam-surface-muted",
    iconClassName: "text-sam-muted",
    chipClassName: "bg-sam-surface-muted text-sam-muted",
  },
  marketing: {
    kind: "marketing",
    wellClassName: "bg-sam-soft-purple",
    iconClassName: "text-sam-fg",
    chipClassName: "bg-sam-soft-purple text-sam-fg",
  },
  delivery: {
    kind: "delivery",
    wellClassName: "bg-sam-warning-soft",
    iconClassName: "text-sam-warning",
    chipClassName: "bg-sam-warning-soft text-sam-fg",
  },
  community: {
    kind: "community",
    wellClassName: "bg-sam-success-soft",
    iconClassName: "text-sam-success",
    chipClassName: "bg-sam-success-soft text-sam-success",
  },
  trade: {
    kind: "trade",
    wellClassName: "bg-sam-primary-soft",
    iconClassName: "text-sam-primary",
    chipClassName: "bg-sam-primary-soft text-sam-primary",
  },
  chat: {
    kind: "chat",
    wellClassName: "bg-sam-primary-soft",
    iconClassName: "text-sam-primary",
    chipClassName: "bg-sam-primary-soft text-sam-primary",
  },
  cs: {
    kind: "cs",
    wellClassName: "bg-sam-surface-muted",
    iconClassName: "text-sam-fg",
    chipClassName: "bg-sam-surface-muted text-sam-fg",
  },
  default: {
    kind: "default",
    wellClassName: "bg-sam-surface-muted",
    iconClassName: "text-sam-muted",
    chipClassName: "bg-sam-surface-muted text-sam-fg",
  },
};

/**
 * Category visual for DIBAY notification rows (Bell + Full Inbox).
 * Presentation only — does not change badge / destination authority.
 */
export function resolveNotificationInboxVisual(
  item: Pick<
    InboxGroupItem,
    | "push_kind"
    | "notification_type"
    | "campaign_type"
    | "event_type"
    | "surfaceBadge"
  > & {
    bell_presentation_type?: string | null;
  }
): NotificationInboxVisual {
  const push = String(item.push_kind ?? "").trim().toLowerCase();
  const bell = String(item.bell_presentation_type ?? "").trim().toLowerCase();
  const campaign = String(item.campaign_type ?? "").trim().toLowerCase();
  const type = String(item.notification_type ?? "").trim().toLowerCase();
  const event = String(item.event_type ?? "").trim().toLowerCase();

  if (
    campaign === "marketing" ||
    push === "marketing" ||
    bell === "admin_marketing" ||
    event === "admin_marketing_banner"
  ) {
    return VISUALS.marketing;
  }
  if (campaign === "notice" || push === "notice" || bell === "admin_notice") {
    return VISUALS.notice;
  }
  if (campaign === "system" || push === "system" || bell === "admin_system" || type === "system") {
    return VISUALS.system;
  }
  if (event === "notice_published") {
    return VISUALS.notice;
  }
  if (
    push === "delivery" ||
    type === "commerce" ||
    bell === "customer_order_message" ||
    bell === "owner_store_commerce"
  ) {
    return VISUALS.delivery;
  }
  if (push === "community" || bell.includes("community") || type === "review") {
    return VISUALS.community;
  }
  if (push === "trade" || type === "status" || bell === "trade_message") {
    return VISUALS.trade;
  }
  if (push === "chat" || type === "chat" || bell.includes("message")) {
    return VISUALS.chat;
  }
  if (push === "cs" || type === "report") {
    return VISUALS.cs;
  }
  return VISUALS.default;
}
