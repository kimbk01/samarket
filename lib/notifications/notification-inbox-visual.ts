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
  /** Tailwind-friendly icon well */
  wellClassName: string;
  iconClassName: string;
};

/**
 * Category visual for DIBAY notification cards (Bell + Full Inbox).
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
    return {
      kind: "marketing",
      wellClassName: "bg-amber-100 text-amber-700",
      iconClassName: "text-amber-700",
    };
  }
  if (
    campaign === "notice" ||
    push === "notice" ||
    bell === "admin_notice" ||
    event === "notice_published"
  ) {
    return {
      kind: "notice",
      wellClassName: "bg-[color:var(--sam-primary-soft,#E8F2EC)] text-sam-primary",
      iconClassName: "text-sam-primary",
    };
  }
  if (campaign === "system" || push === "system" || bell === "admin_system" || type === "system") {
    return {
      kind: "system",
      wellClassName: "bg-emerald-100 text-emerald-800",
      iconClassName: "text-emerald-800",
    };
  }
  if (
    push === "delivery" ||
    type === "commerce" ||
    bell === "customer_order_message" ||
    bell === "owner_store_commerce"
  ) {
    return {
      kind: "delivery",
      wellClassName: "bg-teal-100 text-teal-800",
      iconClassName: "text-teal-800",
    };
  }
  if (push === "community" || bell.includes("community") || type === "review") {
    return {
      kind: "community",
      wellClassName: "bg-orange-100 text-orange-800",
      iconClassName: "text-orange-800",
    };
  }
  if (push === "trade" || type === "status" || bell === "trade_message") {
    return {
      kind: "trade",
      wellClassName: "bg-lime-100 text-lime-800",
      iconClassName: "text-lime-800",
    };
  }
  if (push === "chat" || type === "chat" || bell.includes("message")) {
    return {
      kind: "chat",
      wellClassName: "bg-violet-100 text-violet-800",
      iconClassName: "text-violet-800",
    };
  }
  if (push === "cs" || type === "report") {
    return {
      kind: "cs",
      wellClassName: "bg-sky-100 text-sky-800",
      iconClassName: "text-sky-800",
    };
  }
  return {
    kind: "default",
    wellClassName: "bg-sam-primary-soft text-sam-primary",
    iconClassName: "text-sam-primary",
  };
}
