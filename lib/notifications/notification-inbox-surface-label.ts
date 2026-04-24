import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { commerceMetaKindLabel } from "@/lib/notifications/notification-display-labels";

function toPathname(u: string): string {
  const t = u.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      return new URL(t).pathname;
    } catch {
      return t.split("?")[0] ?? t;
    }
  }
  return t.split("?")[0] ?? t;
}

export type InboxSurfaceRowInput = {
  notification_type: string;
  domain?: string | null;
  meta?: Record<string, unknown> | null;
  link_url?: string | null;
};

/**
 * 인박스 카드 상단 요약 뱃지 — 채널(거래 채팅 / 1:1 / 그룹 / 주문·매장 등).
 */
export function resolveInboxSurfaceBadge(
  row: InboxSurfaceRowInput,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const domain = typeof row.domain === "string" ? row.domain.trim() : "";
  const meta = row.meta ?? null;
  const kind = typeof (meta as { kind?: unknown } | null)?.kind === "string"
    ? String((meta as { kind: string }).kind)
    : "";

  if (row.notification_type === "chat") {
    if (domain === "trade_chat") return translate(language, "notif_surface_trade_chat");
    if (domain === "community_chat") {
      if (kind === "group_chat") return translate(language, "notif_surface_group_chat");
      return translate(language, "notif_surface_direct_chat");
    }
    const path = row.link_url ? toPathname(row.link_url) : "";
    if (path.includes("/mypage/trade/chat/")) return translate(language, "notif_surface_trade_chat");
    if (path.includes("/community-messenger/rooms/")) {
      if (kind === "group_chat") return translate(language, "notif_surface_group_chat");
      return translate(language, "notif_surface_direct_chat");
    }
    if (path.includes("/chats/")) return translate(language, "notif_surface_trade_chat");
    if (path.includes("/group-chat/")) return translate(language, "notif_surface_group_chat");
    return translate(language, "notif_surface_chat_fallback");
  }

  if (row.notification_type === "commerce") {
    if (domain === "order") return translate(language, "notif_surface_order");
    if (domain === "store") return translate(language, "notif_surface_store");
    const kl = commerceMetaKindLabel(kind, language);
    return kl ?? translate(language, "notif_surface_commerce");
  }

  if (domain === "order") return translate(language, "notif_surface_order");
  if (domain === "store") return translate(language, "notif_surface_store");

  switch (row.notification_type) {
    case "status":
      return translate(language, "notif_surface_status");
    case "review":
      return translate(language, "notif_surface_review");
    case "report":
      return translate(language, "notif_surface_report");
    case "system":
      return translate(language, "notif_surface_system");
    default:
      return translate(language, "notif_surface_default");
  }
}

/** 채팅 등에서 meta.sender_label 이 있으면 제목 앞에 붙인다. */
export function buildInboxDisplayTitle(
  title: string,
  fromLabel: string | null,
  notificationType: string
): string {
  if (!fromLabel?.trim()) return title;
  const name = fromLabel.trim();
  if (notificationType === "chat") {
    return `${name} · ${title}`;
  }
  return title;
}
