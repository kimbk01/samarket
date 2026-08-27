import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

function titleT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

function ownerAdminTitle(key: MessageKey): string {
  return titleT(key).toLocaleUpperCase();
}

export function getBusinessAdminPageTitleI18n(
  pathname: string,
  search?: string | null
): string | null {
  const raw = pathname.split("?")[0] ?? pathname;
  const p = raw.replace(/\/+$/, "") || "/";
  const qs =
    search != null && String(search).length > 0
      ? String(search).replace(/^\?/, "")
      : pathname.includes("?")
        ? (pathname.split("?")[1] ?? "")
        : "";
  const view = new URLSearchParams(qs).get("view")?.trim() ?? "";

  const matchAny = (suffix: string): boolean =>
    p === `/stores/owner${suffix}` ||
    p === `/my/business${suffix}` ||
    p === `/mypage/business${suffix}`;

  const matchPattern = (re: RegExp): boolean => re.test(p);

  if (p === "/stores/owner" || p === "/my/business" || p === "/mypage/business") return null;

  if (matchAny("/orders") || matchAny("/store-orders")) return ownerAdminTitle("biz_title_orders");
  if (matchAny("/inquiries")) return ownerAdminTitle("biz_title_inquiries");
  if (matchAny("/settlements")) return ownerAdminTitle("biz_title_settlements");
  if (matchAny("/points")) return ownerAdminTitle("biz_title_points");
  if (matchAny("/menu-categories")) return ownerAdminTitle("biz_title_menu_categories");
  if (
    p === "/stores/owner/products/new" ||
    p.startsWith("/stores/owner/products/new/") ||
    p === "/my/business/products/new" ||
    p.startsWith("/my/business/products/new/")
  ) {
    return ownerAdminTitle("biz_title_product_new");
  }
  if (
    matchPattern(/^\/stores\/owner\/products\/[^/]+\/edit$/) ||
    matchPattern(/^\/my\/business\/products\/[^/]+\/edit$/)
  ) {
    return ownerAdminTitle("biz_title_product_edit");
  }
  if (matchAny("/products")) return ownerAdminTitle("biz_title_products");
  if (matchAny("/basic-info")) return ownerAdminTitle("biz_title_basic_info");
  if (matchAny("/profile")) return ownerAdminTitle("biz_title_profile");
  if (matchAny("/ops-status")) return ownerAdminTitle("biz_title_ops");
  if (matchAny("/reviews")) return ownerAdminTitle("biz_title_reviews");
  if (matchAny("/banners")) return ownerAdminTitle("biz_title_banners");
  if (matchAny("/notices")) return ownerAdminTitle("biz_title_notices");
  if (matchAny("/settings")) return ownerAdminTitle("biz_title_settings");
  if (matchAny("/edit")) return ownerAdminTitle("biz_title_edit");
  if (matchAny("/apply")) return ownerAdminTitle("biz_title_apply");

  if (matchAny("/order-chats")) return ownerAdminTitle("biz_title_order_chats");

  if (matchPattern(/^\/stores\/owner\/customer-care\/customer-center$/)) {
    return ownerAdminTitle("biz_title_customer_center");
  }
  if (matchPattern(/^\/stores\/owner\/customer-care\/messages\/[^/]+$/)) {
    return ownerAdminTitle("biz_title_care_messages");
  }
  if (matchPattern(/^\/stores\/owner\/customer-care\/inquiries\/[^/]+$/)) {
    return ownerAdminTitle("biz_title_care_cs_inquiries");
  }
  if (matchPattern(/^\/stores\/owner\/customer-care\/messages(\/[^/]+)?$/)) {
    return ownerAdminTitle("biz_title_care_messages");
  }
  if (matchPattern(/^\/stores\/owner\/customer-care\/inquiries(\/[^/]+)?$/)) {
    return ownerAdminTitle("biz_title_care_cs_inquiries");
  }
  if (matchAny("/customer-care")) return ownerAdminTitle("biz_title_customer_care");

  if (matchAny("/gift-certificates")) {
    if (view === "money") return ownerAdminTitle("biz_title_gift_money");
    if (view === "history" || view === "convert-history" || view === "cash-out-history") {
      return ownerAdminTitle("biz_title_gift_history");
    }
    if (view === "redemptions") return ownerAdminTitle("biz_title_gift_redemptions");
    if (view === "cash-out" || view === "cash-out-success") {
      return ownerAdminTitle("biz_title_gift_cash_out");
    }
    if (view === "convert" || view === "convert-success") {
      return ownerAdminTitle("biz_title_gift_convert");
    }
    if (view === "apply" || view === "applications" || view === "products") {
      return ownerAdminTitle("biz_title_gift_products");
    }
    return ownerAdminTitle("biz_title_gift_certificates");
  }

  if (
    matchPattern(/^\/stores\/owner\/order-chat\/[^/]+$/) ||
    matchPattern(/^\/my\/business\/store-order-chat\/[^/]+$/)
  ) {
    return ownerAdminTitle("biz_title_order_chat");
  }

  return ownerAdminTitle("biz_title_default");
}
