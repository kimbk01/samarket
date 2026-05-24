import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { commitMainBottomNavRoute } from "@/lib/main-menu/main-bottom-nav-route-commit";
import { persistMessengerEntryOrigin } from "@/lib/community-messenger/messenger-entry-origin";
import {
  resolveDeliveryDomainDialItemHref,
  type HomeHubDomainDialContext,
} from "@/lib/delivery/resolve-delivery-domain-dial-item-href";

export type DeliveryDialNavigateArgs = {
  tab: BottomNavItemConfig;
  pathname: string | null;
  currentSearch: string;
  onClose: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
  push: (href: string) => void;
  replace: (href: string) => void;
  goBusinessHubOrModal: (href: string) => void;
  shouldInterceptBusinessHubHref: (href: string) => boolean;
  prefetch?: (href: string) => void;
  onPrewarm?: () => void;
  /** 거래 레일 홈 다이얼 — 메신저 칩 `from=trade` */
  dialContext?: HomeHubDomainDialContext;
};

/**
 * 다이얼 칩 — 하단 탭과 동일 `commitMainBottomNavRoute`.
 * href: `resolveDeliveryDomainDialItemHref(tab)` 단일 소스.
 */
export function runDeliveryDialItemNavigation(args: DeliveryDialNavigateArgs): boolean {
  const {
    tab,
    pathname,
    onClose,
    guardBeforeNavigate,
    goBusinessHubOrModal,
    shouldInterceptBusinessHubHref,
    push,
    replace,
  } = args;

  const dialContext = args.dialContext ?? "delivery";
  const targetHref = resolveDeliveryDomainDialItemHref(tab, dialContext);
  const intentTabId = tab.id === "stores" ? "stores" : tab.id;

  if (tab.id === "stores") {
    persistMessengerEntryOrigin("delivery");
  } else if (targetHref.includes("/community-messenger")) {
    persistMessengerEntryOrigin(dialContext);
  }

  if (tab.id === "delivery-ops-center") {
    const navigate = (href: string) => {
      if (shouldInterceptBusinessHubHref(href)) {
        goBusinessHubOrModal(href);
      } else {
        push(href);
      }
    };
    if (!guardBeforeNavigate(targetHref)) return false;
    args.beginMenuNavigation(targetHref);
    args.onNavigationIntent(tab.id);
    try {
      args.prefetch?.(targetHref);
    } catch {
      /* noop */
    }
    navigate(targetHref);
    onClose();
    return true;
  }

  const result = commitMainBottomNavRoute({
    pathname,
    currentSearch: args.currentSearch,
    href: targetHref,
    tabId: intentTabId,
    beginMenuNavigation: args.beginMenuNavigation,
    onNavigationIntent: args.onNavigationIntent,
    guardBeforeNavigate,
    push,
    replace,
    prefetch: args.prefetch,
    onPrewarm: args.onPrewarm,
    onCloseOverlay: onClose,
    persistMessengerOriginFromHref:
      tab.id === "chat" || targetHref.includes("/community-messenger"),
    skipPerfMark: true,
  });

  return result !== "blocked";
}
