"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOTTOM_NAV_ITEMS,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_THEME,
  type BottomNavIconKey,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  fetchMainBottomNavDeduped,
  MAIN_BOTTOM_NAV_LS_REV_KEY,
} from "@/lib/app/fetch-main-bottom-nav-deduped";
import { KASAMA_MAIN_BOTTOM_NAV_UPDATED } from "@/lib/chats/chat-channel-events";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { cancelScheduledWhenBrowserIdle, isConstrainedNetwork, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** `/home` 에서만 push — 그 외 탭 간 이동은 replace(히스토리 누적·뒤로가기 꼬임 완화) */
function mainTabLinkUsesReplace(pathname: string | null, targetHref: string): boolean {
  if (!pathname) return true;
  if (pathname === "/home" && targetHref !== "/home") return false;
  return true;
}

const TAB_ICONS: Record<BottomNavIconKey, (props: { className?: string }) => React.ReactNode> = {
  home: HomeIcon,
  trade: TradeTabIcon,
  community: CommunityIcon,
  stores: StoreTabIcon,
  orders: OrdersTabIcon,
  chat: ChatIcon,
  my: MyIcon,
};

export function BottomNav() {
  const { tt, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { chatUnread, communityMessengerUnread, philifeChatUnread, storesTabAttention, storeDeepLink } =
    useOwnerHubBadgeBreakdown();
  const { ownerStore } = useOwnerLiteStore();
  const { hubBlockedModal, refresh: refreshBusinessHubGate, setModalOpen: setBusinessHubBlockedModalOpen } =
    useStoreBusinessHubEntryModal(t("common_confirm"), { eager: false });
  const storeDeepLinkNavBusyRef = useRef(false);
  const [tabs, setTabs] = useState<BottomNavItemConfig[]>(() => [...BOTTOM_NAV_ITEMS]);
  const prevPathnameForNavRef = useRef<string | null>(null);
  const isChatRoomDetail =
    (pathname?.match(/^\/community-messenger\/rooms\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/chats\/[^/]+\/?$/) ?? false) ||
    (pathname?.match(/^\/mypage\/trade\/chat\/[^/]+\/?$/) ?? false);

  const applyMainBottomNavItems = useCallback(async (force: boolean) => {
    try {
      const { ok, items } = await fetchMainBottomNavDeduped({ force });
      if (!ok || !items?.length) return;
      setTabs(items);
    } catch {
      /* 코드 기본 탭 유지 */
    }
  }, []);

  /**
   * 하단 탭 설정: 최초 마운트 1회 + 관리자(/admin/*) 이탈 시 강제 재조회.
   * (경로만 바뀔 때마다 호출하면 TTL 캐시 히트여도 불필요한 setState·작업이 반복됨)
   */
  useEffect(() => {
    const cur = pathname ?? "";
    const prev = prevPathnameForNavRef.current;
    prevPathnameForNavRef.current = cur;
    const leftAdminSurface =
      Boolean(prev && cur) && (prev?.startsWith("/admin") ?? false) && !cur.startsWith("/admin");
    if (leftAdminSurface) {
      void applyMainBottomNavItems(true);
      return;
    }
    if (prev !== null) return;
    void applyMainBottomNavItems(false);
  }, [pathname, applyMainBottomNavItems]);

  useEffect(() => {
    const onRemoteUpdate = () => void applyMainBottomNavItems(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MAIN_BOTTOM_NAV_LS_REV_KEY || e.newValue == null) return;
      void applyMainBottomNavItems(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
        window.removeEventListener("storage", onStorage);
      }
    };
  }, [applyMainBottomNavItems]);

  /**
   * 주요 탭·거래채팅 허브 RSC 선로딩 — 예전에는 idle+950ms·3개만 프리페치해 탭 전환이 느렸음.
   * 다음 프레임에 전부 프리페치(저전력망은 생략).
   */
  useLayoutEffect(() => {
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const tradeHub = TRADE_CHAT_SURFACE.messengerListHref;
    const hrefs: string[] = [];
    if (!pathname?.startsWith(tradeHub)) hrefs.push(tradeHub);
    for (const tab of tabs) {
      const h = tab.href?.trim() ?? "";
      if (h && !hrefs.includes(h) && h !== pathname) hrefs.push(h);
    }
    let cancelled = false;
    const idleId = scheduleWhenBrowserIdle(() => {
      if (cancelled) return;
      for (const href of hrefs) {
        if (cancelled) return;
        try {
          router.prefetch(href);
        } catch {
          /* no-op */
        }
      }
    }, 900);
    return () => {
      cancelled = true;
      cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [pathname, tabs, router]);

  if (isChatRoomDetail) return null;

  return (
    <>
    {hubBlockedModal}
    <nav
      className={`${BOTTOM_NAV_SHELL.navClassName} ${BOTTOM_NAV_SHELL.heightClass} min-w-0 max-w-full justify-center overflow-x-hidden`}
    >
      <div className={`${APP_MAIN_COLUMN_CLASS} flex h-full min-w-0 max-w-full`}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
        const Icon = TAB_ICONS[tab.icon];
        const iconActive = tab.iconActiveClass ?? BOTTOM_NAV_THEME.iconActiveClass;
        const iconInactive = tab.iconInactiveClass ?? BOTTOM_NAV_THEME.iconInactiveClass;
        const labelSize = tab.labelSizeClass ?? BOTTOM_NAV_THEME.labelSizeClass;
        const labelFontFam = tab.labelFontFamilyClass ?? "";
        const labelActive =
          [labelSize, labelFontFam, tab.labelActiveClass ?? BOTTOM_NAV_THEME.labelActiveClass, tab.labelActiveExtraClass]
            .filter(Boolean)
            .join(" ");
        const labelInactive =
          [labelSize, labelFontFam, tab.labelInactiveClass ?? BOTTOM_NAV_THEME.labelInactiveClass, tab.labelInactiveExtraClass]
            .filter(Boolean)
            .join(" ");
        const iconSize = tab.iconSizeClass ?? BOTTOM_NAV_THEME.iconSizeClass;

        const isStoresTab = tab.icon === "stores";
        const storesTabOwnerLite = isStoresTab && !!ownerStore;
        const storesNavWithAttention =
          isStoresTab &&
          storesTabAttention > 0 &&
          typeof storeDeepLink === "string" &&
          storeDeepLink.length > 0;

        const className = [
          "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
          storesTabOwnerLite && !isActive
            ? "rounded-ui-rect bg-sam-surface/70 shadow-[0_1px_4px_rgba(15,23,42,0.08)] ring-1 ring-sam-border/70"
            : "",
          ownerStore && !isStoresTab && !isActive ? "opacity-80" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const tabBadgeCount = (() => {
          /** 하단 「메신저」탭 — `/community-messenger` 참가자 미읽음 */
          if (tab.icon === "chat") return communityMessengerUnread;
          if (tab.icon === "trade") return chatUnread;
          if (tab.icon === "community") return philifeChatUnread;
          if (tab.icon === "stores") return storesTabAttention;
          if (tab.icon === "my") return 0;
          return 0;
        })();

        const ariaLbl =
          tabBadgeCount > 0
            ? t("nav_attention_needed", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), count: tabBadgeCount })
            : storesTabOwnerLite && ownerStore?.store_name
              ? t("nav_store_owner", { label: tab.labelKey ? t(tab.labelKey) : tt(tab.label), storeName: ownerStore.store_name })
              : undefined;

        const inner = (
          <>
            <span className={isActive ? iconActive : iconInactive}>
              <span className="relative inline-flex">
                <Icon className={iconSize} />
                {tabBadgeCount > 0 ? (
                  <span className={OWNER_HUB_BADGE_DOT_CLASS}>
                    {tabBadgeCount > 99 ? "99+" : tabBadgeCount}
                  </span>
                ) : null}
              </span>
            </span>
            <span className={isActive ? labelActive : labelInactive}>{tab.labelKey ? t(tab.labelKey) : tt(tab.label)}</span>
          </>
        );

        if (storesNavWithAttention && storeDeepLink) {
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={className}
              aria-label={ariaLbl}
              onClick={(e) => {
                e.preventDefault();
                if (storeDeepLinkNavBusyRef.current) return;
                storeDeepLinkNavBusyRef.current = true;
                void (async () => {
                  try {
                    if (shouldInterceptBusinessHubHref(storeDeepLink)) {
                      const block = await refreshBusinessHubGate();
                      if (block) {
                        setBusinessHubBlockedModalOpen(true);
                        return;
                      }
                    }
                    router.push(storeDeepLink);
                  } finally {
                    storeDeepLinkNavBusyRef.current = false;
                  }
                })();
              }}
            >
              {inner}
            </a>
          );
        }

        return (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch
            replace={mainTabLinkUsesReplace(pathname ?? null, tab.href)}
            scroll={false}
            className={className}
            aria-label={ariaLbl}
          >
            {inner}
          </Link>
        );
      })}
      </div>
    </nav>
    </>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

/** 거래·마켓 피드 탭 — 양방향 화살표(교환·거래 느낌, 집 아이콘과 구분) */
function TradeTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
  );
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  );
}

function StoreTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9zm8 4v2m-4-2v2"
      />
    </svg>
  );
}

/** 매장·거래 주문 허브 탭 */
function OrdersTabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function MyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
