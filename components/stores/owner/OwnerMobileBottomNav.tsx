"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardList,
  Home,
  LayoutGrid,
  MessageCircle,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerStoreConsumerHomeHref } from "@/lib/stores/owner-store-consumer-home-href";
import {
  BOTTOM_NAV_BADGE_RING_CLASS,
  BOTTOM_NAV_OUTER_MOTION,
  BOTTOM_NAV_SHELL,
} from "@/lib/main-menu/bottom-nav-config";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useBottomNavScrollHide } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import {
  isOwnerBottomNavTabActive,
  type OwnerBottomNavTabId,
} from "@/lib/stores/owner-bottom-nav-active";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  OWNER_MOBILE_BOTTOM_NAV_ACCENT,
  OWNER_MOBILE_BOTTOM_NAV_ACCENT_SHADOW,
  OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

const OWNER_NAV_ITEMS: Array<{
  id: OwnerBottomNavTabId;
  labelKey: MessageKey;
  icon: typeof LayoutGrid;
  href: (storeId: string, storeSlug?: string | null) => string;
}> = [
  {
    id: "home",
    labelKey: "store_owner_bottom_nav_home",
    icon: Home,
    href: (id, slug) => resolveOwnerStoreConsumerHomeHref(id, slug),
  },
  { id: "dashboard", labelKey: "store_owner_bottom_nav_dashboard", icon: LayoutGrid, href: (id) => OwnerRoutes.hub(id) },
  {
    id: "order-chat",
    labelKey: "store_owner_bottom_nav_order_chat",
    icon: MessageCircle,
    href: (id) => OwnerRoutes.orderChats(id),
  },
  { id: "orders", labelKey: "store_owner_bottom_nav_orders", icon: ClipboardList, href: (id) => OwnerRoutes.orders(id) },
  { id: "menu", labelKey: "store_owner_bottom_nav_menu", icon: UtensilsCrossed, href: (id) => OwnerRoutes.menu(id) },
  { id: "settings", labelKey: "store_owner_bottom_nav_settings", icon: Settings, href: (id) => OwnerRoutes.settings(id) },
];

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * 매장 오너 모바일 하단 탭 — 홈(매장) · 대시보드 · 주문채팅 · 주문 · 메뉴 · 설정.
 * `BusinessAdminShell` 에서만 마운트한다.
 */
export function OwnerMobileBottomNav({
  storeId,
  storeSlug = null,
  chatBadge,
  scrollHideEnabled = true,
}: {
  storeId: string;
  storeSlug?: string | null;
  chatBadge?: number;
  scrollHideEnabled?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const hiddenByScroll = useBottomNavScrollHide(scrollHideEnabled);
  const [portalToBody, setPortalToBody] = useState(false);
  const [pendingActiveId, setPendingActiveId] = useState<OwnerBottomNavTabId | null>(null);
  const lastPathKeyRef = useRef("");

  useEffect(() => {
    setPortalToBody(true);
  }, []);

  const pathKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (lastPathKeyRef.current === pathKey) return;
    lastPathKeyRef.current = pathKey;
    setPendingActiveId(null);
  }, [pathKey]);

  const markTabIntent = useCallback((tabId: OwnerBottomNavTabId) => {
    setPendingActiveId(tabId);
  }, []);

  const isTabActive = useCallback(
    (tabId: OwnerBottomNavTabId) => {
      const pathActive = isOwnerBottomNavTabActive(pathname, searchParams, tabId, storeSlug);
      if (pendingActiveId != null) return tabId === pendingActiveId;
      return pathActive;
    },
    [pathname, searchParams, pendingActiveId, storeSlug]
  );

  const outerClass = cn(
    BOTTOM_NAV_SHELL.outerClassName,
    BOTTOM_NAV_OUTER_MOTION,
    hiddenByScroll ? "translate-y-full" : "translate-y-0"
  );

  const navStyle = {
    ["--owner-nav-accent" as string]: OWNER_MOBILE_BOTTOM_NAV_ACCENT,
    ["--owner-nav-accent-shadow" as string]: OWNER_MOBILE_BOTTOM_NAV_ACCENT_SHADOW,
  } as CSSProperties;

  const nav = (
    <nav
      className={cn(outerClass, OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS)}
      style={navStyle}
      data-biz="1"
      aria-label={t("store_ops_menu_aria")}
    >
      <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`}>
        <div className="app-bottom-nav-grid owner-mobile-bottom-nav-grid">
          {OWNER_NAV_ITEMS.map((a) => {
            const href = a.href(storeId, storeSlug);
            const active = isTabActive(a.id);
            const Icon = a.icon;
            const showChatBadge = a.id === "order-chat" && (chatBadge ?? 0) > 0;
            return (
              <Link
                key={a.id}
                href={href}
                prefetch={false}
                scroll={false}
                data-active={active ? "true" : "false"}
                aria-label={t(a.labelKey)}
                aria-current={active ? "page" : undefined}
                className={cn("app-bottom-nav-item group", BOTTOM_NAV_ITEM_TOUCH_CLASS)}
                onClick={() => {
                  if (!active) markTabIntent(a.id);
                }}
              >
                <div className="app-bottom-nav-icon-slot">
                  <span className="app-bottom-nav-inline-icon" key={active ? "on" : "off"}>
                    <Icon className="app-bottom-nav-icon-svg" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    {showChatBadge ?
                      <span
                        className={cn(
                          "bottom-nav-hub-badge",
                          OWNER_HUB_BADGE_DOT_CLASS,
                          BOTTOM_NAV_BADGE_RING_CLASS
                        )}
                      >
                        {(chatBadge ?? 0) > 99 ? "99+" : chatBadge}
                      </span>
                    : null}
                  </span>
                </div>
                <span className="app-bottom-nav-label">{t(a.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }
  return nav;
}
