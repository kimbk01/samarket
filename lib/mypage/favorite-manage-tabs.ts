import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";

/** 찜한 상품 — 내정보 거래관리 하위 탭 */
export type FavoriteManageTabId = "all" | "active" | "sold" | "gone";

export const FAVORITE_MANAGE_TABS: { id: FavoriteManageTabId; label: string; labelKey: MessageKey }[] = [
  { id: "all", label: "전체 찜", labelKey: "tab_all_favorites" },
  { id: "active", label: "판매중", labelKey: "tab_active_sale" },
  { id: "sold", label: "거래완료", labelKey: "tab_trade_completed" },
  { id: "gone", label: "품절/삭제됨", labelKey: "tab_sold_out_deleted" },
];

export function getFavoriteManageTabId(post: Pick<FavoritedPost, "status">): FavoriteManageTabId {
  const st = String(post.status ?? "active").toLowerCase();
  if (st === "sold") return "sold";
  if (st === "hidden" || st === "blinded" || st === "deleted") return "gone";
  return "active";
}

export function filterFavoritesByTab(
  posts: FavoritedPost[],
  tab: FavoriteManageTabId
): FavoritedPost[] {
  if (tab === "all") return posts;
  return posts.filter((p) => getFavoriteManageTabId(p) === tab);
}

export function countFavoriteManageTabs(posts: FavoritedPost[]): Record<FavoriteManageTabId, number> {
  const counts: Record<FavoriteManageTabId, number> = {
    all: posts.length,
    active: 0,
    sold: 0,
    gone: 0,
  };
  for (const p of posts) {
    counts[getFavoriteManageTabId(p)] += 1;
  }
  return counts;
}

export function getFavoriteManageTabLabel(
  id: FavoriteManageTabId,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const tab = FAVORITE_MANAGE_TABS.find((item) => item.id === id);
  return tab ? translate(language, tab.labelKey) : id;
}
