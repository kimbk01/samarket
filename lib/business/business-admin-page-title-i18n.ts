import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

function titleT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

export function getBusinessAdminPageTitleI18n(pathname: string): string | null {
  const raw = pathname.split("?")[0] ?? pathname;
  const p = raw.replace(/\/+$/, "") || "/";

  const matchAny = (suffix: string): boolean =>
    p === `/stores/owner${suffix}` ||
    p === `/my/business${suffix}` ||
    p === `/mypage/business${suffix}`;

  const matchPattern = (re: RegExp): boolean => re.test(p);

  if (p === "/stores/owner" || p === "/my/business" || p === "/mypage/business") return null;

  if (matchAny("/orders") || matchAny("/store-orders")) return titleT("biz_title_orders");
  if (matchAny("/inquiries")) return titleT("biz_title_inquiries");
  if (matchAny("/settlements")) return titleT("biz_title_settlements");
  if (matchAny("/menu-categories")) return titleT("biz_title_menu_categories");
  if (
    p === "/stores/owner/products/new" ||
    p.startsWith("/stores/owner/products/new/") ||
    p === "/my/business/products/new" ||
    p.startsWith("/my/business/products/new/")
  ) {
    return titleT("biz_title_product_new");
  }
  if (
    matchPattern(/^\/stores\/owner\/products\/[^/]+\/edit$/) ||
    matchPattern(/^\/my\/business\/products\/[^/]+\/edit$/)
  ) {
    return titleT("biz_title_product_edit");
  }
  if (matchAny("/products")) return titleT("biz_title_products");
  if (matchAny("/basic-info")) return titleT("biz_title_basic_info");
  if (matchAny("/profile")) return titleT("biz_title_profile");
  if (matchAny("/ops-status")) return titleT("biz_title_ops");
  if (matchAny("/reviews")) return titleT("biz_title_reviews");
  if (matchAny("/banners")) return titleT("biz_title_banners");
  if (matchAny("/notices")) return titleT("biz_title_notices");
  if (matchAny("/settings")) return titleT("biz_title_settings");
  if (matchAny("/edit")) return titleT("biz_title_edit");
  if (matchAny("/apply")) return titleT("biz_title_apply");

  if (
    matchPattern(/^\/stores\/owner\/order-chat\/[^/]+$/) ||
    matchPattern(/^\/my\/business\/store-order-chat\/[^/]+$/)
  ) {
    return titleT("biz_title_order_chat");
  }

  return titleT("biz_title_default");
}
