import type { MessageKey } from "@/lib/i18n/messages";
import type {
  AdminBanner,
  BannerChangeLog,
  BannerPlacement,
  BannerStatus,
} from "@/lib/types/admin-banner";

export const ADMIN_BANNER_STATUS_KEYS: Record<BannerStatus, MessageKey> = {
  draft: "admin_banners_status_draft",
  active: "admin_banners_status_active",
  paused: "admin_banners_status_paused",
  expired: "admin_banners_status_expired",
  hidden: "admin_banners_status_hidden",
};

export const ADMIN_BANNER_PLACEMENT_KEYS: Record<BannerPlacement, MessageKey> = {
  home_top: "admin_banners_placement_home_top",
  home_middle: "admin_banners_placement_home_middle",
  product_detail: "admin_banners_placement_product_detail",
  search_top: "admin_banners_placement_search_top",
  mypage_top: "admin_banners_placement_mypage_top",
};

export const ADMIN_BANNER_CHANGELOG_ACTION_KEYS: Record<
  BannerChangeLog["actionType"],
  MessageKey
> = {
  create: "admin_banners_changelog_create",
  update: "admin_banners_changelog_update",
  activate: "admin_banners_changelog_activate",
  pause: "admin_banners_changelog_pause",
  hide: "admin_banners_changelog_hide",
  reorder: "admin_banners_changelog_reorder",
  expire: "admin_banners_changelog_expire",
};

export function bannerPlacementLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  placement: AdminBanner["placement"] | string
): string {
  const key = ADMIN_BANNER_PLACEMENT_KEYS[placement as BannerPlacement];
  return key ? t(key) : String(placement);
}
