"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { CustomerCenterBoardSwitcher } from "@/components/mypage/cs/CustomerCenterBoardSwitcher";
import { CustomerCenterBoardTypeIcon } from "@/components/mypage/cs/CustomerCenterBoardTypeIcon";
import { CustomerCenterContentMedia } from "@/components/notices/CustomerCenterContentMedia";
import {
  formatCustomerCenterRowDate,
  groupCustomerCenterItemsByDate,
} from "@/lib/mypage/customer-center-date-sections";
import { CC_BOARD_PAGE_DEFAULT, normalizeCcBoardQuery } from "@/lib/mypage/customer-center-board-query";
import {
  CC_CARD_CLASS,
  CC_CATEGORY_CHIP_CLASS,
  CC_HEADER_CLASS,
  CC_NOTE_CLASS,
} from "@/lib/mypage/customer-center-ui";
import {
  fetchMypageListJson,
  forgetMypageListCache,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { excerptCustomerCenterMarkdown } from "@/lib/notices/customer-center-safe-markdown";
import {
  buildCustomerCenterBoardDetailPath,
  CUSTOMER_CENTER_HUB_HREF,
} from "@/lib/notices/customer-center-content-paths";
import { Sam } from "@/lib/ui/sam-component-classes";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";

export type CustomerCenterBoardListItem = {
  id: string;
  contentType?: CustomerCenterContentType;
  title: string;
  body: string;
  heroImageUrl?: string | null;
  authorLabel?: string;
  viewCount?: number;
  commentCount?: number;
  createdAt: string;
  canonicalHref?: string;
  href?: string;
  /** 알림 최종 설계 §5 — 회원 읽음(열람 기록)·게시 7일 이내 */
  read?: boolean;
  isNew?: boolean;
};

/** 목록 필터 — 전체 / 안읽음 */
export type CustomerCenterBoardFilter = "all" | "unread";

type BoardListJson = {
  ok?: boolean;
  notices?: CustomerCenterBoardListItem[];
  nextCursor?: string | null;
};

/** 검색 입력 후 서버 검색까지 대기 (S61) */
export const CC_BOARD_SEARCH_DEBOUNCE_MS = 300;

/** 목록 캐시·단일 비행 키 — 게시판·검색어별 (`me:cc:board:{type}:{q}`) */
export function customerCenterBoardCacheKey(
  type: CustomerCenterContentType,
  q: string | null,
  filter: CustomerCenterBoardFilter = "all"
): string {
  return filter === "unread" ? `me:cc:board:${type}:${q ?? ""}:unread` : `me:cc:board:${type}:${q ?? ""}`;
}

/** `GET /api/me/settings/notices` 요청 주소 — 서버 검색(`q`)·커서·첫 페이지 20건 */
export function customerCenterBoardListUrl(
  type: CustomerCenterContentType,
  q: string | null,
  cursor: string | null,
  filter: CustomerCenterBoardFilter = "all"
): string {
  const sp = new URLSearchParams({ content_type: type, limit: String(CC_BOARD_PAGE_DEFAULT) });
  if (q) sp.set("q", q);
  if (filter === "unread") sp.set("filter", "unread");
  if (cursor) sp.set("cursor", cursor);
  return `/api/me/settings/notices?${sp.toString()}`;
}

/** 화면 키(`cc-board:{type}`) — 검색어·검색창 열림을 복귀 시 복원 */
function searchStorageKey(type: CustomerCenterContentType): string {
  return `cc-board:${type}`;
}

function readSavedSearch(type: CustomerCenterContentType): { q: string; open: boolean } {
  try {
    const raw = window.sessionStorage.getItem(searchStorageKey(type));
    if (!raw) return { q: "", open: false };
    const v = JSON.parse(raw) as { q?: unknown; open?: unknown };
    return { q: typeof v.q === "string" ? v.q : "", open: v.open === true };
  } catch {
    return { q: "", open: false };
  }
}

function writeSavedSearch(type: CustomerCenterContentType, v: { q: string; open: boolean }): void {
  try {
    if (!v.q && !v.open) window.sessionStorage.removeItem(searchStorageKey(type));
    else window.sessionStorage.setItem(searchStorageKey(type), JSON.stringify(v));
  } catch {
    /* 저장 불가 환경 — 복원만 생략 */
  }
}

/**
 * 고객센터 게시판 목록 (최종 설계 S61) — 서버 검색·커서 더 보기·실패 5xx → 오류+재시도.
 * 고정글 구역은 DB 컬럼이 없어 그리지 않는다(X16/K12).
 */
export function CustomerCenterBoardListClient({ contentType }: { contentType: CustomerCenterContentType }) {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const boardLabel = BOARD_LABEL[contentType][lang];
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null);
  const [searchHydrated, setSearchHydrated] = useState(false);
  const [filter, setFilter] = useState<CustomerCenterBoardFilter>("all");
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [markBusy, setMarkBusy] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const json = await fetchMypageListJson<{ ok?: boolean; unread_counts?: Record<string, number> }>(
        "/api/me/settings/notices?unread_counts=1"
      );
      if (json.ok && json.unread_counts) setUnreadCount(Math.max(0, Number(json.unread_counts[contentType]) || 0));
    } catch {
      /* 숫자만 생략 */
    }
  }, [contentType]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const saved = readSavedSearch(contentType);
    setQuery(saved.q);
    setSearchOpen(saved.open || Boolean(saved.q));
    setAppliedQuery(normalizeCcBoardQuery(saved.q));
    setSearchHydrated(true);
  }, [contentType]);

  useEffect(() => {
    if (!searchHydrated) return;
    writeSavedSearch(contentType, { q: query, open: searchOpen });
    const timer = window.setTimeout(() => setAppliedQuery(normalizeCcBoardQuery(query)), CC_BOARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [contentType, query, searchOpen, searchHydrated]);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<CustomerCenterBoardListItem>> => {
      const json = await fetchMypageListJson<BoardListJson>(
        customerCenterBoardListUrl(contentType, appliedQuery, cursor, filter)
      );
      if (!json.ok) throw new Error("cc_board_not_ok");
      return {
        items: Array.isArray(json.notices) ? json.notices : [],
        next_cursor: typeof json.nextCursor === "string" && json.nextCursor ? json.nextCursor : null,
      };
    },
    [appliedQuery, contentType, filter]
  );

  const list = useMypageCursorList<CustomerCenterBoardListItem>({
    cacheKey: searchHydrated ? customerCenterBoardCacheKey(contentType, appliedQuery, filter) : null,
    fetchPage,
    getId: (n) => n.id,
  });

  useMypageListRestore({ ready: searchHydrated && list.status === "ready", loadedPages: list.pages });

  const sections = useMemo(() => groupCustomerCenterItemsByDate(list.items, lang), [list.items, lang]);

  /** 알림 최종 설계 §5 — 이 게시판 「모두 읽음」: 열람 기록 + 같은 글을 가리키는 알림도 읽음 */
  const markAllRead = async () => {
    if (markBusy) return;
    setMarkBusy(true);
    try {
      const res = await fetch("/api/me/settings/notices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read", content_type: contentType }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notificationsRead?: number };
      if (res.ok && j.ok) {
        forgetMypageListCache("me:cc:board:");
        setUnreadCount(0);
        void list.reload();
        if ((j.notificationsRead ?? 0) > 0) {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
          resyncBadgesAfterNotificationEventsRead("notification_opened");
        }
      }
    } finally {
      setMarkBusy(false);
    }
  };

  const toggleSearch = () => {
    if (searchOpen) setQuery("");
    setSearchOpen(!searchOpen);
  };

  let body: ReactNode;
  if (!searchHydrated || list.status === "loading") {
    body = <MyStateView kind="loading" template="board" rows={5} />;
  } else if (list.status === "error") {
    body = (
      <MyStateView
        kind="error"
        template="board"
        error={{
          message: safeT("settings_notices_load_failed", {
            fallbackKo: "목록을 불러오지 못했습니다",
            fallbackEn: "Could not load the list",
          }),
          onRetry: () => void list.reload(),
        }}
      />
    );
  } else if (list.items.length === 0) {
    body = (
      <MyStateView
        kind="empty"
        template="board"
        empty={{
          title: appliedQuery
            ? t("mypage_s61_search_empty", { q: appliedQuery })
            : filter === "unread"
              ? t("cc_list_unread_empty")
              : safeT("settings_notices_empty", { fallbackKo: "게시글이 없습니다", fallbackEn: "No posts yet" }),
        }}
      />
    );
  } else {
    body = (
      <div className="space-y-4" data-testid="cc-board-list">
        {sections.map((sec) => (
          <section key={sec.sectionKey} className="min-w-0">
            <h2 className={`mb-2 px-0.5 font-semibold ${CC_NOTE_CLASS}`}>{sec.sectionLabel}</h2>
            <ul className={CC_CARD_CLASS}>
              {sec.items.map((n, index) => {
                const href = n.canonicalHref?.trim() || buildCustomerCenterBoardDetailPath(contentType, n.id);
                const hero = normalizeCustomerCenterHeroImageUrl(n.heroImageUrl);
                // 알림 최종 설계 §5 — 대표 이미지가 있으면 모든 게시판에서 썸네일
                const showThumb = Boolean(hero);
                const unread = n.read === false;
                return (
                  <li
                    key={n.id}
                    className={index === 0 ? "" : "border-t border-sam-border-soft"}
                    data-cc-row-unread={unread ? "1" : "0"}
                  >
                    <Link
                      href={href}
                      className="flex min-w-0 items-start gap-3 px-4 py-3.5 transition active:bg-sam-pressed-surface md:px-5"
                    >
                      <CustomerCenterBoardTypeIcon contentType={contentType} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-start justify-between gap-2">
                          <span className={CC_CATEGORY_CHIP_CLASS}>{boardLabel}</span>
                          <span className={`shrink-0 tabular-nums ${CC_NOTE_CLASS}`}>
                            {formatCustomerCenterRowDate(n.createdAt, lang)}
                          </span>
                        </span>
                        <span
                          className={`mt-1.5 flex min-w-0 items-center gap-1.5 ${CC_HEADER_CLASS} ${
                            unread ? "font-bold text-sam-fg" : "font-normal text-sam-muted"
                          }`}
                        >
                          {unread ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sam-primary" data-cc-unread-dot>
                              <span className="sr-only">{t("cc_list_unread_sr")}</span>
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate">{n.title}</span>
                          {n.isNew ? (
                            <span className="shrink-0 rounded-full bg-sam-danger px-1.5 text-[10px] font-bold leading-[16px] text-sam-on-primary">
                              {t("cc_list_new_badge")}
                            </span>
                          ) : null}
                        </span>
                        <span className={`mt-0.5 block line-clamp-1 break-words ${CC_NOTE_CLASS}`}>
                          {excerptCustomerCenterMarkdown(String(n.body ?? ""), 90)}
                        </span>
                      </span>
                      {showThumb ? (
                        <span className="mt-0.5 h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted sm:h-16 sm:w-16">
                          <CustomerCenterContentMedia src={hero} alt="" variant="thumb" />
                        </span>
                      ) : (
                        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-sam-meta" strokeWidth={2} aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <MyListPager
          hasMore={list.nextCursor != null}
          loading={list.loadingMore}
          error={list.loadMoreError}
          onLoadMore={list.loadMore}
        />
      </div>
    );
  }

  return (
    <MyScreen
      title={boardLabel}
      backHref={CUSTOMER_CENTER_HUB_HREF}
      preferHistoryBack={false}
      template="board"
      headerRight={
        <button
          type="button"
          className={`sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-primary ${Sam.focusRing}`}
          aria-label={safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
          aria-expanded={searchOpen}
          data-testid="cc-board-search-toggle"
          onClick={toggleSearch}
        >
          <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      }
    >
      <div className="flex flex-col gap-3 pb-4" data-testid={`cc-board-${contentType}`}>
        <CustomerCenterBoardSwitcher active={contentType} language={lang} />
        <div className="flex items-center justify-between gap-2" data-testid="cc-board-read-filter">
          <div className="flex gap-1.5" role="group">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-ui-rect border px-3 text-[13px] font-semibold ${
                  filter === f
                    ? "border-sam-primary bg-sam-primary-soft text-sam-primary"
                    : "border-sam-border bg-sam-surface text-sam-fg"
                }`}
              >
                {f === "all" ? t("cc_list_filter_all") : t("cc_list_filter_unread", { n: unreadCount ?? 0 })}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={markBusy || unreadCount === 0}
            onClick={() => void markAllRead()}
            className="min-h-9 px-2 text-[13px] font-semibold text-sam-primary disabled:text-sam-muted disabled:opacity-60"
            data-testid="cc-board-mark-all-read"
          >
            {t("cc_list_mark_all_read")}
          </button>
        </div>
        {searchOpen ? (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            maxLength={100}
            data-testid="cc-board-search-input"
            placeholder={t("mypage_s61_search_placeholder")}
            className={`${Sam.input.base} w-full text-[16px]`}
          />
        ) : null}
        {body}
      </div>
    </MyScreen>
  );
}
