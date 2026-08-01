import type { BadgeTargetSurface } from "@/lib/notifications/badge-target-policy";
import type { FetchMeNotificationsListOpts, InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";

/** Tier1 종이 사용하는 consumer/owner badge surface (admin 제외) */
export const TIER1_BELL_BADGE_SURFACES = [
  "tier1_inbox_bell",
  "bottom_nav_my",
  "bottom_nav_chat",
  "bottom_nav_community",
  "bottom_nav_delivery",
  "owner_commerce_inbox",
] as const;

export type Tier1BellBadgeSurface = (typeof TIER1_BELL_BADGE_SURFACES)[number];

export function isTier1BellBadgeSurface(v: string | null | undefined): v is Tier1BellBadgeSurface {
  return TIER1_BELL_BADGE_SURFACES.includes(v as Tier1BellBadgeSurface);
}

function normalizePath(pathname: string | null | undefined): string {
  const p = (pathname ?? "").split("?")[0]?.split("#")[0] ?? "";
  if (!p || p === "/") return "/";
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
}

/**
 * pathname → Tier1 종 badge surface (notification_targets SSOT).
 * surface 간 합산 금지 — 해당 탭·화면과 동일 집계만.
 */
export function resolveTier1BellSurfaceFromPathname(
  pathname: string | null | undefined
): Tier1BellBadgeSurface {
  const path = normalizePath(pathname);

  if (path.startsWith("/stores/owner")) {
    return "owner_commerce_inbox";
  }
  if (path === "/community-messenger" || path.startsWith("/community-messenger/")) {
    return "bottom_nav_chat";
  }
  if (path === "/philife" || path.startsWith("/philife/")) {
    return "bottom_nav_community";
  }
  if (path === "/market" || path.startsWith("/market/")) {
    return "bottom_nav_my";
  }
  if (
    path === "/stores" ||
    path.startsWith("/stores/") ||
    path === "/orders" ||
    path.startsWith("/orders/")
  ) {
    return "bottom_nav_delivery";
  }
  return "tier1_inbox_bell";
}

export type Tier1BellListFetchOpts = Pick<
  FetchMeNotificationsListOpts,
  "excludeChatMessages" | "excludeOwnerStoreCommerce" | "pushKind"
> & {
  ownerStoreId?: string;
};

/** surface별 인박스 목록 fetch 옵션 — 뱃지 숫자는 변경하지 않음 */
export function resolveTier1BellListFetchOpts(
  surface: Tier1BellBadgeSurface,
  ownerStoreId?: string | null
): Tier1BellListFetchOpts {
  switch (surface) {
    case "bottom_nav_chat":
      return { pushKind: "chat" as InboxPushKindFilter };
    case "bottom_nav_community":
      return { excludeChatMessages: true, pushKind: "community" as InboxPushKindFilter };
    case "bottom_nav_my":
      return { excludeChatMessages: true, pushKind: "trade" as InboxPushKindFilter };
    case "bottom_nav_delivery":
      return {
        excludeChatMessages: true,
        excludeOwnerStoreCommerce: true,
        pushKind: "delivery" as InboxPushKindFilter,
      };
    case "owner_commerce_inbox":
      return { ownerStoreId: ownerStoreId?.trim() || undefined };
    case "tier1_inbox_bell":
    default:
      // Phase B — Header Bell digit = NotificationAttention only.
      // Chat message rows may still appear as history/quarantine in some list paths,
      // but default Tier1 list excludes chat so digit and list stay aligned.
      return { excludeChatMessages: true, pushKind: "all" as InboxPushKindFilter };
  }
}

export function resolveTier1BellUnreadFetchUrl(
  surface: Tier1BellBadgeSurface,
  storeId?: string | null
): string {
  const sp = new URLSearchParams();
  sp.set("unread_count_only", "1");
  sp.set("badge_surface", surface);
  const sid = storeId?.trim();
  if (sid && surface === "owner_commerce_inbox") {
    sp.set("owner_store_id", sid);
  }
  return `/api/me/notifications?${sp.toString()}`;
}

export function badgeSurfaceToPriorityPushKind(
  surface: Tier1BellBadgeSurface
): InboxPushKindFilter | null {
  const opts = resolveTier1BellListFetchOpts(surface);
  const pk = opts.pushKind;
  return pk && pk !== "all" ? pk : null;
}

/** PATCH /api/me/notifications — surface별 「모두 읽음」 fallback (목록 ids 우선) */
export type Tier1BellMarkAllReadBody =
  | { ids: string[] }
  | { mark_all_read: true }
  | { mark_all_owner_store_commerce_read: true }
  | { mark_my_chat_notifications_read: true }
  | { mark_my_notifications_read_excluding_owner_and_chat: true };

export function resolveTier1BellMarkAllReadBody(
  surface: Tier1BellBadgeSurface,
  unreadIds: string[]
): Tier1BellMarkAllReadBody {
  const ids = [...new Set(unreadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length > 0) return { ids };

  switch (surface) {
    case "tier1_inbox_bell":
      // Bell digit Authority = all approved unread notification_events (not rooms).
      return { mark_all_read: true };
    case "owner_commerce_inbox":
      return { mark_all_owner_store_commerce_read: true };
    case "bottom_nav_chat":
      return { mark_my_chat_notifications_read: true };
    default:
      return { mark_my_notifications_read_excluding_owner_and_chat: true };
  }
}

export type { BadgeTargetSurface };
