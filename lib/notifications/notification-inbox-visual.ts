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
    return {
      kind: "marketing",
      wellClassName: "bg-[#EEF6EF]",
      iconClassName: "text-[#2F6B3A]",
      chipClassName: "bg-[#F3E8E4] text-[#5C4A42]",
    };
  }
  if (campaign === "notice" || push === "notice" || bell === "admin_notice") {
    return {
      kind: "notice",
      wellClassName: "bg-[#E8F2EC]",
      iconClassName: "text-sam-primary",
      chipClassName: "bg-[#EFE6DC] text-[#5C534A]",
    };
  }
  if (campaign === "system" || push === "system" || bell === "admin_system" || type === "system") {
    return {
      kind: "system",
      wellClassName: "bg-[#ECECEA]",
      iconClassName: "text-[#4A4A46]",
      chipClassName: "bg-[#EFE8E0] text-[#5A534C]",
    };
  }
  if (event === "notice_published") {
    return {
      kind: "notice",
      wellClassName: "bg-[#E8F2EC]",
      iconClassName: "text-sam-primary",
      chipClassName: "bg-[#EFE6DC] text-[#5C534A]",
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
      wellClassName: "bg-[#F1E8DE]",
      iconClassName: "text-[#8A5A32]",
      chipClassName: "bg-[#F0E6DC] text-[#6A5340]",
    };
  }
  if (push === "community" || bell.includes("community") || type === "review") {
    return {
      kind: "community",
      wellClassName: "bg-[#EAF3EC]",
      iconClassName: "text-[#3D6B48]",
      chipClassName: "bg-[#E8F0E6] text-[#4A5C48]",
    };
  }
  if (push === "trade" || type === "status" || bell === "trade_message") {
    return {
      kind: "trade",
      wellClassName: "bg-[#EAF4EC]",
      iconClassName: "text-[#2F6B3A]",
      chipClassName: "bg-[#E7F0E6] text-[#3F5A42]",
    };
  }
  if (push === "chat" || type === "chat" || bell.includes("message")) {
    return {
      kind: "chat",
      wellClassName: "bg-[#EAF4EC]",
      iconClassName: "text-[#2F6B3A]",
      chipClassName: "bg-[#E7F0E6] text-[#3F5A42]",
    };
  }
  if (push === "cs" || type === "report") {
    return {
      kind: "cs",
      wellClassName: "bg-[#E8F0F4]",
      iconClassName: "text-[#3A5F73]",
      chipClassName: "bg-[#E8EEF0] text-[#465660]",
    };
  }
  return {
    kind: "default",
    wellClassName: "bg-[#E8F2EC]",
    iconClassName: "text-sam-primary",
    chipClassName: "bg-[#EFE6DC] text-[#5C534A]",
  };
}
