"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BOTTOM_NAV_ITEMS,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_THEME,
  type BottomNavIconKey,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { fetchChatRoomsAllDeduped } from "@/lib/chats/fetch-chat-rooms-all-deduped";

const TAB_ICONS: Record<BottomNavIconKey, (props: { className?: string }) => React.ReactNode> = {
  home: HomeIcon,
  community: CommunityIcon,
  stores: StoreTabIcon,
  orders: OrdersTabIcon,
  chat: ChatIcon,
  my: MyIcon,
};

type UnreadChatPickRow = {
  id: string;
  unreadCount?: number;
  lastMessageAt?: string;
  partnerNickname?: string;
  lastMessage?: string;
  product?: { title?: string } | null;
};

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { chatUnread, storesTabAttention, storeDeepLink } = useOwnerHubBadgeBreakdown();
  const myAppNotificationUnread = useMyNotificationUnreadCount();
  const [tabs, setTabs] = useState<BottomNavItemConfig[]>(() => [...BOTTOM_NAV_ITEMS]);
  const [unreadChatPicker, setUnreadChatPicker] = useState<UnreadChatPickRow[] | null>(null);

  const closeUnreadChatPicker = useCallback(() => setUnreadChatPicker(null), []);

  useEffect(() => {
    if (!unreadChatPicker?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeUnreadChatPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unreadChatPicker?.length, closeUnreadChatPicker]);

  const openUnreadChatTarget = useCallback(async () => {
    try {
      const { status, json: raw } = await fetchChatRoomsAllDeduped();
      const j =
        status >= 200 && status < 300 ? (raw as { rooms?: UnreadChatPickRow[] }) : ({} as { rooms?: UnreadChatPickRow[] });
      const rooms = Array.isArray(j.rooms) ? j.rooms : [];
      const candidates = rooms.filter(
        (r) => (r.unreadCount ?? 0) > 0 && typeof r.id === "string" && r.id.trim()
      ) as UnreadChatPickRow[];
      candidates.sort(
        (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
      );
      if (candidates.length === 0) {
        router.push("/chats");
        return;
      }
      if (candidates.length === 1) {
        router.push(`/chats/${encodeURIComponent(candidates[0].id.trim())}`);
        return;
      }
      setUnreadChatPicker(candidates);
    } catch {
      router.push("/chats");
    }
  }, [router]);

  const goToUnreadRoom = useCallback(
    (id: string) => {
      closeUnreadChatPicker();
      router.push(`/chats/${encodeURIComponent(id.trim())}`);
    },
    [router, closeUnreadChatPicker]
  );

  /** 탭 전환은 replace로 쌓지 않음(뒤로가기가 채팅 등으로만 가는 현상 방지). 홈 루트에서만 push로 이전 홈 유지. */
  const onMainTabLinkClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, targetHref: string) => {
      if (!pathname) return;
      if (pathname === targetHref) return;
      if (pathname.startsWith(`${targetHref}/`)) {
        e.preventDefault();
        router.replace(targetHref);
        return;
      }
      e.preventDefault();
      if (pathname === "/home") {
        router.push(targetHref);
        return;
      }
      router.replace(targetHref);
    },
    [pathname, router]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/app/main-bottom-nav", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !data?.ok || !Array.isArray(data.items)) return;
        const next = data.items as BottomNavItemConfig[];
        if (next.length > 0) setTabs(next);
      } catch {
        /* 코드 기본 탭 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
    <nav
      className={`${BOTTOM_NAV_SHELL.navClassName} ${BOTTOM_NAV_SHELL.heightClass} justify-center`}
    >
      <div className={`${APP_MAIN_COLUMN_CLASS} flex h-full min-w-0`}>
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

        const isChatTab = tab.icon === "chat";
        const chatNavWithUnread = isChatTab && chatUnread > 0;
        const isStoresTab = tab.icon === "stores";
        const storesNavWithAttention =
          isStoresTab &&
          storesTabAttention > 0 &&
          typeof storeDeepLink === "string" &&
          storeDeepLink.length > 0;

        const className =
          "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2";
        const tabBadgeCount = (() => {
          if (tab.icon === "chat") return chatUnread;
          if (tab.icon === "stores") return storesTabAttention;
          if (tab.icon === "my") return Math.max(0, myAppNotificationUnread ?? 0);
          return 0;
        })();

        const ariaLbl =
          tabBadgeCount > 0 ? `${tab.label}, 확인 필요 ${tabBadgeCount}건` : undefined;

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
            <span className={isActive ? labelActive : labelInactive}>{tab.label}</span>
          </>
        );

        if (chatNavWithUnread) {
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={className}
              aria-label={ariaLbl}
              onClick={(e) => {
                e.preventDefault();
                void openUnreadChatTarget();
              }}
            >
              {inner}
            </a>
          );
        }

        if (storesNavWithAttention && storeDeepLink) {
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={className}
              aria-label={ariaLbl}
              onClick={(e) => {
                e.preventDefault();
                router.push(storeDeepLink);
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
            className={className}
            aria-label={ariaLbl}
            onClick={(e) => onMainTabLinkClick(e, tab.href)}
          >
            {inner}
          </Link>
        );
      })}
      </div>
    </nav>

    {unreadChatPicker && unreadChatPicker.length > 1 ? (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unread-chat-picker-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeUnreadChatPicker();
        }}
      >
        <div
          className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 id="unread-chat-picker-title" className="text-[15px] font-semibold text-gray-900">
              읽지 않은 채팅
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-500">들어갈 채팅방을 선택해 주세요.</p>
          </div>
          <ul className="max-h-[min(55vh,380px)] divide-y divide-gray-100 overflow-y-auto">
            {unreadChatPicker.map((r) => {
              const title = (r.partnerNickname ?? "채팅").trim() || "채팅";
              const sub =
                (r.lastMessage ?? "").trim() ||
                (r.product?.title ?? "").trim() ||
                "새 메시지";
              const n = r.unreadCount ?? 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => goToUnreadRoom(r.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-gray-900">{title}</span>
                        {n > 0 ? (
                          <span className="shrink-0 rounded-full bg-[#FF6B00] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                            {n > 99 ? "99+" : n}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-gray-500">{sub}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-gray-100 p-3">
            <button
              type="button"
              onClick={closeUnreadChatPicker}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-[14px] text-gray-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                closeUnreadChatPicker();
                router.push("/chats");
              }}
              className="mt-2 w-full rounded-xl py-2.5 text-[14px] font-medium text-gray-900"
            >
              채팅 목록으로
            </button>
          </div>
        </div>
      </div>
    ) : null}
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
