import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import type { ManagedMyCtaLink } from "@/lib/my/managed-my-section-ctas";

function myCtaT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

function withLabels(items: Array<{ href: string; labelKey: MessageKey }>): ManagedMyCtaLink[] {
  return items.map(({ href, labelKey }) => ({ href, label: myCtaT(labelKey) }));
}

export function getTradeSectionCtas(): ManagedMyCtaLink[] {
  return withLabels([
    { href: MYPAGE_HOME_TRADE_SALES_HREF, labelKey: "my_cta_trade_hub" },
    { href: TRADE_CHAT_MESSENGER_LIST_HREF, labelKey: "my_cta_trade_chat" },
    { href: "/mypage/trade/sales", labelKey: "my_cta_trade_sales" },
    { href: "/mypage/trade/favorites", labelKey: "my_cta_trade_favorites" },
    { href: "/mypage/trade/reviews", labelKey: "my_cta_trade_reviews" },
  ]);
}

export function getOrdersSectionCtas(): ManagedMyCtaLink[] {
  return withLabels([
    { href: "/mypage/store-orders", labelKey: "my_cta_orders_history" },
    { href: TRADE_CHAT_MESSENGER_LIST_HREF, labelKey: "my_cta_trade_chat" },
    { href: "/mypage/trade/sales", labelKey: "my_cta_trade_sales" },
  ]);
}

export function getBoardSectionCtas(): ManagedMyCtaLink[] {
  return withLabels([{ href: "/mypage/community-posts", labelKey: "my_cta_board_activity" }]);
}

export function getStoreSectionCtas(ownerStoreId?: string | null): ManagedMyCtaLink[] {
  const sid = ownerStoreId?.trim();
  const enc = sid ? encodeURIComponent(sid) : "";
  const newOrdersHref = sid ? `/stores/owner/orders?storeId=${enc}` : "/stores/owner/orders";
  const hubHref = sid ? `/stores/owner?storeId=${enc}` : "/stores/owner";

  if (sid) {
    return withLabels([
      { href: newOrdersHref, labelKey: "my_cta_store_new_orders" },
      { href: hubHref, labelKey: "my_cta_store_hub" },
      { href: "/mypage/store-orders", labelKey: "my_cta_store_my_orders" },
    ]);
  }

  return withLabels([
    { href: newOrdersHref, labelKey: "my_cta_store_intake" },
    { href: hubHref, labelKey: "my_cta_store_hub" },
    { href: "/mypage/store-orders", labelKey: "my_cta_store_my_orders" },
    { href: "/stores/owner/apply", labelKey: "my_cta_store_apply" },
  ]);
}

export function getAccountSectionCtas(): ManagedMyCtaLink[] {
  return withLabels([
    { href: "/mypage", labelKey: "my_cta_account_home" },
    { href: "/mypage/account", labelKey: "my_cta_account" },
    { href: "/mypage/notifications", labelKey: "my_cta_notifications" },
    { href: "/mypage/order-notifications", labelKey: "my_cta_order_notifications" },
    { href: "/mypage/points", labelKey: "my_cta_points" },
    { href: buildMypageInfoHubHref(), labelKey: "my_cta_app_settings" },
  ]);
}
