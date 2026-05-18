"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** 하단 탭(3.5rem+safe) + 본문과 동일 2pt 간격 */
const RAIL_BOTTOM = "calc(3.5rem + env(safe-area-inset-bottom, 0px) + 2pt)";

const SLIDE_MS = 380;
const SLIDE_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
const ROW_FROM_Y = 44;
const ROW_STAGGER_MS = 52;
const CLOSE_EXTRA_MS = 96;

const RAIL_LABEL_CLASS =
  "max-w-[9rem] truncate rounded-ui-rect bg-sam-surface px-3 py-1.5 text-center text-[calc(11px+1pt)] font-semibold leading-tight text-sam-fg shadow-md ring-1 ring-black/[0.06]";

const FAB_BASE =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(0,0,0,0.22)] ring-2 ring-sam-surface/35 [&_svg]:h-5 [&_svg]:w-5 active:opacity-90";

/**
 * 홈 거래 플로팅 CTA — 피드에서 빠른 거래·쓰기 진입용.
 * `/mypage/trade`(내정보→나의 거래)에서는 목록형 메뉴만 쓰고 이 레일은 띄우지 않음.
 */
type RailLabelKey =
  | "ui_home_rail_trade_hub"
  | "trade_031"
  | "trade_122"
  | "nav_trade_chat"
  | "trade_111"
  | "trade_017"
  | "ui_home_rail_reviews_manage"
  | "ui_home_rail_trust_battery"
  | "ui_home_rail_my_products"
  | "ui_home_rail_delivery_orders"
  | "ui_home_rail_points_ledger";

const TRADE_HUB_RAIL_LINKS: readonly {
  key: string;
  labelKey: RailLabelKey;
  href: string;
  fabClass: string;
  Icon: ComponentType;
}[] = [
  {
    key: "hub",
    labelKey: "ui_home_rail_trade_hub",
    href: "/mypage/trade/purchases",
    fabClass: `${FAB_BASE} bg-sam-fg/10`,
    Icon: HubGridIcon,
  },
  {
    key: "purchases",
    labelKey: "trade_031",
    href: "/mypage/trade/purchases",
    fabClass: `${FAB_BASE} bg-amber-600`,
    Icon: BagIcon,
  },
  {
    key: "sales",
    labelKey: "trade_122",
    href: "/mypage/trade/sales",
    fabClass: `${FAB_BASE} bg-rose-600`,
    Icon: CartIcon,
  },
  {
    key: "chat",
    labelKey: "nav_trade_chat",
    href: TRADE_CHAT_SURFACE.messengerListHref,
    fabClass: `${FAB_BASE} bg-violet-600`,
    Icon: ChatBubbleIcon,
  },
  {
    key: "favorites",
    labelKey: "trade_111",
    href: MYPAGE_TRADE_FAVORITES_HREF,
    fabClass: `${FAB_BASE} bg-pink-600`,
    Icon: HeartIcon,
  },
  {
    key: "reviews-hub",
    labelKey: "trade_017",
    href: "/mypage/trade/reviews",
    fabClass: `${FAB_BASE} bg-orange-500`,
    Icon: StarIcon,
  },
  {
    key: "reviews-manage",
    labelKey: "ui_home_rail_reviews_manage",
    href: "/mypage/reviews",
    fabClass: `${FAB_BASE} bg-purple-600`,
    Icon: StarOutlineIcon,
  },
  {
    key: "trust",
    labelKey: "ui_home_rail_trust_battery",
    href: "/my/trust",
    fabClass: `${FAB_BASE} bg-teal-600`,
    Icon: TrustIcon,
  },
  {
    key: "my-products",
    labelKey: "ui_home_rail_my_products",
    href: "/my/products",
    fabClass: `${FAB_BASE} bg-cyan-600`,
    Icon: DocIcon,
  },
  {
    key: "store-orders",
    labelKey: "ui_home_rail_delivery_orders",
    href: "/my/store-orders",
    fabClass: `${FAB_BASE} bg-blue-700`,
    Icon: StoreBagIcon,
  },
  {
    key: "points",
    labelKey: "ui_home_rail_points_ledger",
    href: "/my/points/ledger",
    fabClass: `${FAB_BASE} bg-indigo-600`,
    Icon: CoinIcon,
  },
] as const;

/** 글쓰기 + 위 링크 행 → 스태거 인덱스 상한 */
const MAX_ROW_INDEX = TRADE_HUB_RAIL_LINKS.length;

/** 홈은 `HomeTradeHubFloatingBar`(하단 플로팅 카드)로 통합 — 우측 레일 미사용 */
const TRADE_HUB_SIDE_RAIL_PATHS = new Set<string>();

function isTradeHubSideRailPath(pathname: string | null): boolean {
  return typeof pathname === "string" && TRADE_HUB_SIDE_RAIL_PATHS.has(pathname);
}

export function HomeTradeReelsSideRail() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const tradeWriteSheet = useTradeWriteSheetOptional();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const [railOpen, setRailOpen] = useState(true);
  const [sheetEntered, setSheetEntered] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipRailEnterAnimationRef = useRef(true);

  const onWriteClick = useCallback(() => {
    if (tradeWriteSheet) {
      if (!guardBeforeNavigate()) return;
      tradeWriteSheet.open("");
      return;
    }
    if (!guardBeforeNavigate()) return;
    router.push("/write");
  }, [router, tradeWriteSheet, guardBeforeNavigate]);

  useEffect(() => {
    if (!railOpen) {
      setSheetEntered(false);
      skipRailEnterAnimationRef.current = false;
      return;
    }
    if (skipRailEnterAnimationRef.current) {
      skipRailEnterAnimationRef.current = false;
      setSheetEntered(true);
      return;
    }
    setSheetEntered(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setSheetEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [railOpen]);

  const closeRail = useCallback(() => {
    setSheetEntered(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    const wait = SLIDE_MS + MAX_ROW_INDEX * ROW_STAGGER_MS + CLOSE_EXTRA_MS;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setRailOpen(false);
    }, wait);
  }, []);

  const toggleRail = useCallback(() => {
    if (railOpen) closeRail();
    else setRailOpen(true);
  }, [railOpen, closeRail]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const showRail = isTradeHubSideRailPath(pathname);

  return (
    <>
      {showRail ? (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 z-[22]"
            style={{ bottom: RAIL_BOTTOM }}
          >
            <div className={`${APP_MAIN_HEADER_INNER_CLASS} pointer-events-none relative`}>
              <div className="pointer-events-none absolute bottom-0 right-0 flex max-w-full flex-row items-end gap-3">
                <div className="flex min-w-0 shrink-0 flex-col items-end gap-3">
                  {railOpen ? (
                    <nav
                      id="home-quick-rail-menu"
                      className="pointer-events-auto flex max-h-[min(78vh,32rem)] flex-col items-end gap-3 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
                      aria-label={t("ui_home_rail_trade_menu_aria")}
                    >
                      <StackRow index={0} sheetEntered={sheetEntered} maxIndex={MAX_ROW_INDEX}>
                        <span className={RAIL_LABEL_CLASS}>{t("nav_write_aria")}</span>
                        <button
                          type="button"
                          onClick={onWriteClick}
                          className={`${FAB_BASE} bg-emerald-600`}
                          aria-label={t("nav_write_aria")}
                        >
                          <PlusIcon />
                        </button>
                      </StackRow>

                      {TRADE_HUB_RAIL_LINKS.map((item, i) => (
                        <StackRow key={item.key} index={i + 1} sheetEntered={sheetEntered} maxIndex={MAX_ROW_INDEX}>
                          <span className={RAIL_LABEL_CLASS}>{t(item.labelKey)}</span>
                          <Link
                            href={item.href}
                            prefetch={false}
                            className={item.fabClass}
                            aria-label={t(item.labelKey)}
                          >
                            <item.Icon />
                          </Link>
                        </StackRow>
                      ))}
                    </nav>
                  ) : null}

                  <button
                    type="button"
                    onClick={toggleRail}
                    aria-expanded={railOpen}
                    aria-haspopup="true"
                    aria-controls="home-quick-rail-menu"
                    className={`pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_20px_rgba(0,0,0,0.22)] ring-2 transition active:opacity-90 ${
                      railOpen ? "bg-sam-fg/10 ring-sam-surface/35" : "bg-signature ring-sam-surface/25"
                    }`}
                    aria-label={railOpen ? t("ui_home_rail_menu_close") : t("ui_home_rail_menu_open")}
                  >
                    {railOpen ? <RadialCloseIcon /> : <MoreIcon />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function StackRow({
  index,
  sheetEntered,
  maxIndex,
  children,
}: {
  index: number;
  sheetEntered: boolean;
  maxIndex: number;
  children: ReactNode;
}) {
  const openDelay = (maxIndex - index) * ROW_STAGGER_MS;
  const closeDelay = index * ROW_STAGGER_MS;

  return (
    <div
      className="flex shrink-0 flex-row-reverse items-center gap-2.5"
      style={{
        transform: sheetEntered ? "translateY(0)" : `translateY(${ROW_FROM_Y}px)`,
        opacity: sheetEntered ? 1 : 0,
        transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity 0.3s ${SLIDE_EASE}`,
        transitionDelay: `${sheetEntered ? openDelay : closeDelay}ms`,
        pointerEvents: sheetEntered ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="6" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18" cy="12" r="1.75" />
    </svg>
  );
}

function RadialCloseIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function HubGridIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.811l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.691l1.519-4.674z"
      />
    </svg>
  );
}

function StarOutlineIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  );
}

function TrustIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function StoreBagIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9zM3 10h4l1 5m12 0v-5h-4"
      />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
