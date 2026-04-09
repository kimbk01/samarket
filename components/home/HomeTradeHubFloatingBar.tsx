"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { HomeTradeHistorySheetContent } from "@/components/home/HomeTradeHistorySheetContent";
import { MypageTradeHubChatList } from "@/components/mypage/MypageTradeHubChatList";
import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";
import {
  fetchTradeHistoryPurchasesBySession,
  fetchTradeHistorySalesBySession,
} from "@/lib/mypage/trade-history-client";
import { WriteLauncherPanel } from "@/components/write-launcher/WriteLauncher";
import { WriteLauncherOverlay } from "@/components/write-launcher/WriteLauncherOverlay";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import {
  HOME_TRADE_HUB_FLOAT_BOTTOM_CLASS,
  HOME_TRADE_HUB_PRIMARY_FAB_BUTTON_CLASS,
  HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { parseRoomId } from "@/lib/validate-params";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

const CATEGORY_PREFIXES = ["/market/", "/community/", "/philife/", "/services/", "/features/"];

function slugFromPath(pathname: string): string | null {
  for (const prefix of CATEGORY_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const slug = pathname.slice(prefix.length).replace(/\/.*$/, "").trim();
      return slug || null;
    }
  }
  return null;
}

/** 참고 UI: 흰 라벨 박스 (왼쪽) */
const LABEL_BOX_CLASS =
  "max-w-[11rem] truncate rounded-ui-rect border border-neutral-300 bg-white px-3 py-2 text-center text-[13px] font-semibold leading-tight text-neutral-900 shadow-sm";

const SLIDE_MS = 320;
const SLIDE_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
/** 시트 슬라이드 — 너무 길면 ‘불러오기’처럼 느껴짐 */
const SHEET_MS = 200;
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const ROW_FROM_Y = 28;
const ROW_STAGGER_MS = 45;

type HomeTradeHubSheet = "purchases" | "chat";

type MenuDef = {
  key: string;
  label: string;
  href?: string;
  Icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
};

/**
 * TRADE 탐색 화면 공통(`isTradeFloatingMenuSurface`) — 우하단 세로 일열, 라벨(왼)·파란 원, 틸 메인 FAB.
 * `/market/[slug]` 가 늘어나도 셸에서 동일 마운트.
 */
export function HomeTradeHubFloatingBar() {
  const { t, tt } = useI18n();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { chatUnread: tradeChatUnread } = useOwnerHubBadgeBreakdown();
  const writeCtx = useWriteCategory();
  const writeCategorySlug = writeCtx?.writeCategorySlug ?? null;
  const launcherCategoriesLoading = writeCtx?.launcherCategoriesLoading ?? true;
  const hasLauncherTopics = (writeCtx?.launcherRootCategories?.length ?? 0) > 0;
  const pathSlug = slugFromPath(pathname);
  const categorySlug = writeCategorySlug ?? pathSlug;
  /** 어드민 「런처에 표시」 항목이 없고 현재 경로 주제도 없으면 다이얼에서 글쓰기 행 숨김 */
  const showWriteInDial =
    Boolean(categorySlug) || hasLauncherTopics || launcherCategoriesLoading;

  const [menuOpen, setMenuOpen] = useState(false);
  const [dialEntered, setDialEntered] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [hubSheet, setHubSheet] = useState<HomeTradeHubSheet | null>(null);
  const [hubSheetEntered, setHubSheetEntered] = useState(false);
  /** `hubSheet === "chat"` 일 때만 — 목록 vs 대화 */
  const [tradeChatRoomId, setTradeChatRoomId] = useState<string | null>(null);
  const skipEnterAnimRef = useRef(true);

  useEffect(() => {
    if (!menuOpen) {
      setDialEntered(false);
      skipEnterAnimRef.current = false;
      return;
    }
    if (skipEnterAnimRef.current) {
      skipEnterAnimRef.current = false;
      setDialEntered(true);
      return;
    }
    setDialEntered(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setDialEntered(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [menuOpen]);

  const onWriteClick = useCallback(() => {
    setMenuOpen(false);
    if (categorySlug) {
      router.push(`/write/${encodeURIComponent(categorySlug)}`);
      return;
    }
    setLauncherOpen(true);
  }, [categorySlug, router]);

  const openPurchasesSheet = useCallback(() => {
    setMenuOpen(false);
    setHubSheet("purchases");
  }, []);

  const openChatSheet = useCallback(() => {
    setMenuOpen(false);
    setHubSheet("chat");
  }, []);

  const closeHubSheet = useCallback(() => {
    setHubSheet(null);
    setTradeChatRoomId(null);
  }, []);

  const backTradeChatToList = useCallback(() => {
    setTradeChatRoomId(null);
  }, []);

  useEffect(() => {
    if (hubSheet !== "chat") setTradeChatRoomId(null);
  }, [hubSheet]);

  const menuItems: MenuDef[] = useMemo(() => {
    const rows: MenuDef[] = [];
    if (showWriteInDial) {
      rows.push({ key: "write", label: t("common_write"), Icon: PlusBoldIcon, onClick: onWriteClick });
    }
    rows.push(
      { key: "trade-chat", label: t("nav_trade_chat"), Icon: ChatBubbleIcon, onClick: openChatSheet },
      { key: "trade-history", label: t("nav_trade_history"), Icon: BagIcon, onClick: openPurchasesSheet },
    );
    return rows;
  }, [showWriteInDial, onWriteClick, openChatSheet, openPurchasesSheet, t]);

  const maxRowIndex = menuItems.length - 1;

  const toggleMenu = useCallback(() => {
    if (launcherOpen) setLauncherOpen(false);
    setMenuOpen((v) => !v);
  }, [launcherOpen]);

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setLauncherOpen(false);
    setHubSheet(null);
  }, []);

  const onBackdropClick = useCallback(() => {
    setMenuOpen(false);
  }, []);

  /** 이중 rAF 제거 — 페인트 전에 열린 상태로 맞춰 바로 확인 가능하게 */
  useLayoutEffect(() => {
    if (!hubSheet) {
      setHubSheetEntered(false);
      return;
    }
    setHubSheetEntered(true);
  }, [hubSheet]);

  /** 다이얼이 열리면 거래내역·거래채팅에 쓰는 데이터를 미리 받아 두어 탭 선택 시 체감 대기 단축 (세션 쿠키만 있으면 됨) */
  useEffect(() => {
    if (!menuOpen) return;
    void fetchChatRoomsBySegment("trade");
    void fetchTradeHistoryPurchasesBySession().catch(() => {});
    void fetchTradeHistorySalesBySession().catch(() => {});
  }, [menuOpen]);

  useEffect(() => {
    if (!hubSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [hubSheet]);

  useEffect(() => {
    if (!launcherOpen && !hubSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (hubSheet === "chat" && tradeChatRoomId) {
        backTradeChatToList();
        return;
      }
      if (hubSheet) {
        closeHubSheet();
        return;
      }
      closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launcherOpen, hubSheet, tradeChatRoomId, closeAll, closeHubSheet, backTradeChatToList]);

  const shellZ = launcherOpen ? "z-[33]" : "z-[21]";

  /** 거래 미읽음: 시트로 목록/대화 열면 행·방 단위로만 표시 — 플로팅에는 숨김 */
  const showFloatingTradeChatBadge = tradeChatUnread > 0 && hubSheet !== "chat";

  return (
    <>
      {menuOpen && !launcherOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[20] bg-black/30 backdrop-blur-[3px]"
          aria-label={t("nav_menu_close")}
          onClick={onBackdropClick}
        />
      ) : null}

      {launcherOpen ? (
        <WriteLauncherOverlay
          onClose={closeAll}
          className="fixed inset-0 z-[32] bg-black/30 backdrop-blur-[3px]"
        />
      ) : null}

      {hubSheet ? (
        <div
          className="fixed inset-0 z-[50] flex flex-col justify-end pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby={
            hubSheet === "purchases"
              ? "home-trade-history-sheet-title"
              : hubSheet === "chat" && !tradeChatRoomId
                ? "home-trade-chat-sheet-title"
                : undefined
          }
          aria-label={
            hubSheet === "chat" && tradeChatRoomId ? `${tt(TRADE_CHAT_SURFACE.hubTabLabel)} ${t("nav_conversation")}` : undefined
          }
        >
          <button
            type="button"
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${hubSheetEntered ? "opacity-100" : "opacity-0"}`}
            aria-label={hubSheet === "purchases" ? `${t("nav_trade_history_title")} ${t("nav_close")}` : `${tt(TRADE_CHAT_SURFACE.hubTabLabel)} ${t("nav_close")}`}
            onClick={closeHubSheet}
          />
          <div
            className={`relative z-[1] flex max-h-[min(88dvh,900px)] w-full flex-col rounded-t-[length:var(--ui-radius-rect)] bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform ease-out ${hubSheetEntered ? "translate-y-0" : "translate-y-full"}`}
            style={{ transitionDuration: `${SHEET_MS}ms`, transitionTimingFunction: SHEET_EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-col border-b border-neutral-200 pt-2 pb-1">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
              {hubSheet === "chat" && tradeChatRoomId ? (
                <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} flex justify-end pb-2 pt-0`}>
                  <HubSheetCloseButton
                    onClick={closeHubSheet}
                    ariaLabel={`${tt(TRADE_CHAT_SURFACE.hubTabLabel)} ${t("nav_close")}`}
                  />
                </div>
              ) : (
                <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} flex items-center justify-between pb-3 pt-0`}>
                  <h2
                    id={hubSheet === "purchases" ? "home-trade-history-sheet-title" : "home-trade-chat-sheet-title"}
                    className="text-[17px] font-semibold text-gray-900"
                  >
                    {hubSheet === "purchases" ? t("nav_trade_history_title") : tt(TRADE_CHAT_SURFACE.hubTabLabel)}
                  </h2>
                  <HubSheetCloseButton
                    onClick={closeHubSheet}
                    ariaLabel={hubSheet === "purchases" ? `${t("nav_trade_history_title")} ${t("nav_close")}` : `${tt(TRADE_CHAT_SURFACE.hubTabLabel)} ${t("nav_close")}`}
                  />
                </div>
              )}
            </div>
            <div
              className={
                hubSheet === "purchases"
                  ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2`
                  : tradeChatRoomId
                    ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`
                    : `min-h-0 flex-1 overflow-y-auto overscroll-contain ${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3`
              }
            >
              {hubSheet === "purchases" ? (
                <HomeTradeHistorySheetContent />
              ) : tradeChatRoomId ? (
                <ChatRoomScreen
                  roomId={parseRoomId(tradeChatRoomId)}
                  listHref={TRADE_CHAT_SURFACE.hubPath}
                  onListNavigate={backTradeChatToList}
                  tradeHubColumnLayout
                />
              ) : (
                <MypageTradeHubChatList onSelectRoom={(id) => setTradeChatRoomId(id)} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`pointer-events-none fixed inset-x-0 ${HOME_TRADE_HUB_FLOAT_BOTTOM_CLASS} ${shellZ}`}
      >
        {/*
         * 헤더 행과 동일한 읽기 폭만 맞추고 `overflow-x-hidden` 은 쓰지 않음.
         * 그 안에 absolute+우측 FAB 를 두면 그림자·배지가 잘리거나 높이 0 부모 때문에
         * 일부 환경에서 플로팅이 보이지 않을 수 있음 → in-flow flex 로 정렬.
         */}
        <div
          className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-none mx-auto box-border flex w-full min-w-0 flex-col items-end gap-3`}
        >
            {launcherOpen ? (
              <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                <WriteLauncherPanel onClose={closeAll} subFabClose />
              </div>
            ) : null}

            {!launcherOpen ? (
              <nav
                id="home-trade-speed-dial"
                className="flex flex-col items-end gap-3"
                aria-label={t("nav_trade_quick_menu")}
              >
                {menuOpen
                  ? menuItems.map((item, i) => (
                      <DialRow
                        key={item.key}
                        index={i}
                        maxIndex={maxRowIndex}
                        dialEntered={dialEntered}
                      >
                        <span className={LABEL_BOX_CLASS}>{item.label}</span>
                        {item.onClick ? (
                          <button
                            type="button"
                            onClick={item.onClick}
                            className={HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS}
                            aria-label={
                              item.key === "trade-chat" && showFloatingTradeChatBadge && menuOpen
                                ? t("nav_attention_needed", {
                                    label: item.label,
                                    count: tradeChatUnread > 99 ? "99+" : tradeChatUnread,
                                  })
                                : item.label
                            }
                          >
                            <span className="relative inline-flex">
                              <item.Icon className="text-white" />
                              {item.key === "trade-chat" && showFloatingTradeChatBadge && menuOpen ? (
                                <span className={OWNER_HUB_BADGE_DOT_CLASS}>
                                  {tradeChatUnread > 99 ? "99+" : tradeChatUnread}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        ) : (
                          <Link
                            href={item.href!}
                            prefetch={false}
                            onClick={() => setMenuOpen(false)}
                            className={HOME_TRADE_HUB_SUB_FAB_BUTTON_CLASS}
                            aria-label={item.label}
                          >
                            <item.Icon className="text-white" />
                          </Link>
                        )}
                      </DialRow>
                    ))
                  : null}
              </nav>
            ) : null}

            {!launcherOpen ? (
              <button
                type="button"
                onClick={toggleMenu}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-controls={menuOpen ? "home-trade-speed-dial" : undefined}
                className={`${HOME_TRADE_HUB_PRIMARY_FAB_BUTTON_CLASS} relative`}
                aria-label={
                  !menuOpen && showFloatingTradeChatBadge
                    ? `${t("nav_menu_open")}, ${t("nav_attention_needed", {
                        label: t("nav_trade_chat"),
                        count: tradeChatUnread > 99 ? "99+" : tradeChatUnread,
                      })}`
                    : menuOpen
                      ? t("nav_menu_close")
                      : t("nav_menu_open")
                }
              >
                <span className="relative inline-flex">
                  {menuOpen ? <CloseIcon /> : <PlusBoldIcon />}
                  {!menuOpen && showFloatingTradeChatBadge ? (
                    <span className={OWNER_HUB_BADGE_DOT_CLASS}>
                      {tradeChatUnread > 99 ? "99+" : tradeChatUnread}
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null}
        </div>
      </div>
    </>
  );
}

/** flex-row → 왼쪽 라벨, 오른쪽 원형 버튼 */
function DialRow({
  index,
  maxIndex,
  dialEntered,
  children,
}: {
  index: number;
  maxIndex: number;
  dialEntered: boolean;
  children: ReactNode;
}) {
  const openDelay = (maxIndex - index) * ROW_STAGGER_MS;
  const closeDelay = index * ROW_STAGGER_MS;
  return (
    <div
      className="flex shrink-0 flex-row items-center gap-2.5"
      style={{
        transform: dialEntered ? "translateY(0)" : `translateY(${ROW_FROM_Y}px)`,
        opacity: dialEntered ? 1 : 0,
        transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity 0.28s ${SLIDE_EASE}`,
        transitionDelay: `${dialEntered ? openDelay : closeDelay}ms`,
        pointerEvents: dialEntered ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

/** 바텀 시트 헤더 닫기 — 모바일: 원형 ✕(유니코드), md↑: 「닫기」 */
function HubSheetCloseButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-[transform,background-color] active:scale-95 hover:bg-black/[0.06] md:h-10 md:min-w-[44px] md:rounded-lg md:px-2 md:text-signature"
    >
      <span
        className="flex h-[26px] w-[26px] items-center justify-center text-[22px] font-light leading-none md:hidden"
        aria-hidden
      >
        ✕
      </span>
      <span className="hidden text-[14px] font-medium md:inline">{t("nav_close")}</span>
    </button>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusBoldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function BagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

