"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { KASAMA_NOTIFICATIONS_UPDATED, NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";
import {
  fetchMeNotificationsListDeduped,
  invalidateMeNotificationsListDedupedCache,
} from "@/lib/me/fetch-me-notifications-deduped";
import { prewarmInboxNotificationChatHref } from "@/lib/notifications/prewarm-inbox-notification-href";
import { buildInboxGroupItems, type InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";
import { NotificationInboxEmptyState } from "@/components/notifications/NotificationInboxEmptyState";
import { NotificationBellEmptyShortcuts } from "@/components/notifications/NotificationBellEmptyShortcuts";
import { resolveNotifInboxErrorMessageKey } from "@/lib/notifications/resolve-notif-inbox-error-message";
import type { MessageKey } from "@/lib/i18n/messages";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import type { BellPresentationType } from "@/lib/notifications/inbox-events-merge";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import {
  NotificationInboxTabBar,
  type NotificationInboxTabKey,
} from "@/components/notifications/NotificationInboxTabBar";
import {
  EMPTY_NOTIFICATION_CENTER_TAB_UNREAD,
  type NotificationCenterCategoryKey,
  type NotificationCenterTabUnreadCounts,
} from "@/lib/notifications/notification-center-tab-unread";
import { activateNotificationDestination } from "@/lib/notifications/navigate-notification-destination";
import { NotificationContentUnavailableNotice } from "@/components/notifications/NotificationContentUnavailableNotice";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import {
  findNotificationCenterTargetRow,
  normalizeNotificationCenterTargetId,
  shouldShowNotificationCenterRowForTarget,
} from "@/lib/notifications/notification-center-target";
import { markNotificationCenterScrollRestore } from "@/lib/notifications/notification-center-scroll-restore";
import { NotificationInboxRowSkeleton } from "@/components/notifications/NotificationInboxRowSkeleton";

type Row = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
  domain?: string | null;
  push_kind?: string | null;
  bell_presentation_type?: BellPresentationType | null;
  event_type?: string | null;
  campaign_type?: string | null;
};

const INBOX_PAGE_SIZE = 40;

/** 알림 최종 설계 §2-2 (Owner 승인 2026-11-01) — 종 분야 탭 (순서 고정). */
const CATEGORY_TABS: NotificationCenterCategoryKey[] = [
  "all",
  "ops",
  "delivery",
  "trade",
  "community",
  "marketing",
  "support",
];

function parseCategoryTab(raw: string | null): NotificationCenterCategoryKey {
  // 구 주소 호환: 공지·시스템 → 운영 소식, 고객센터(cs) → 고객센터, 매장(store) → 전체.
  if (raw === "notice" || raw === "system") return "ops";
  if (raw === "cs") return "support";
  if (raw === "store") return "all";
  if (raw && (CATEGORY_TABS as string[]).includes(raw)) return raw as NotificationCenterCategoryKey;
  return "all";
}

type TradeOfferNotificationMeta = {
  kind?: string;
  event?: string;
  notification_type?: string;
  /** 스펙 `type`과 동기 — `event` 누락 시 보조 */
  spec_type?: string;
  status?: string;
  offer_id?: string;
};

function resolvePendingTradeOfferMeta(item: InboxGroupItem): TradeOfferNotificationMeta | null {
  const meta = item.meta as TradeOfferNotificationMeta | null;
  const offerId = typeof meta?.offer_id === "string" ? meta.offer_id.trim() : "";
  if (!offerId) return null;
  if (meta?.kind !== "trade_offer") return null;
  const isCreated =
    meta?.event === "offer_created" ||
    meta?.spec_type === "offer_created" ||
    meta?.notification_type === "offer_created";
  if (!isCreated) return null;
  if (meta?.status !== "pending") return null;
  return meta;
}

export type MyNotificationsViewProps = {
  /** Gate 3 Step 8 — Notification Center product surface */
  variant?: "default" | "notification_center";
  registerMarkAll?: (fn: () => Promise<void>) => void;
  /** U-G: 보이는 알림 행 수 — 빈 목록이면 페이지 ⋯ 「선택」 비활성 */
  onVisibleCountChange?: (count: number) => void;
};

/** 행동 실패 토스트 표시 시간 — 내정보 토스트(`MYPAGE_TOAST_MS`)와 같은 3초 */
const NOTIFICATION_ACTION_TOAST_MS = 3000;

export function MyNotificationsView({
  variant = "default",
  registerMarkAll,
  onVisibleCountChange,
}: MyNotificationsViewProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useI18n();
  const categoryChips = useMemo(
    (): { key: NotificationInboxTabKey; label: string }[] => [
      { key: "all", label: t("notif_filter_all") },
      { key: "ops", label: t("notif_filter_ops") },
      { key: "delivery", label: t("notif_filter_delivery") },
      { key: "trade", label: t("notif_filter_trade") },
      { key: "community", label: t("notif_filter_community") },
      { key: "marketing", label: t("notif_filter_marketing") },
      { key: "support", label: t("notif_filter_support") },
    ],
    [t]
  );
  const [tabCounts, setTabCounts] = useState<NotificationCenterTabUnreadCounts>(
    EMPTY_NOTIFICATION_CENTER_TAB_UNREAD
  );
  const [pollEnabled, setPollEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  /** 목록 로드 오류 전용(본문 하나) — 데이터와 동시에 표시하지 않는다 */
  const [error, setError] = useState<string | null>(null);
  /**
   * 읽음·삭제·제안 응답 등 **행동 실패** — 목록은 그대로 두고 토스트로만 알린다(설계서 §4 ⑤).
   * 로드 오류 자리(`error`)를 쓰면 오류 문구와 목록이 함께 보였다.
   */
  const [actionErrorToast, setActionErrorToast] = useState<string | null>(null);
  useEffect(() => {
    if (!actionErrorToast) return;
    const timer = setTimeout(() => setActionErrorToast(null), NOTIFICATION_ACTION_TOAST_MS);
    return () => clearTimeout(timer);
  }, [actionErrorToast]);
  const [busy, setBusy] = useState(false);
  const tabFromUrl = parseCategoryTab(searchParams?.get("tab") ?? null);
  const [categoryFilter, setCategoryFilter] = useState<NotificationCenterCategoryKey>(tabFromUrl);
  const targetNotificationId = useMemo(
    () => normalizeNotificationCenterTargetId(searchParams?.get("notificationId") ?? null),
    [searchParams]
  );
  const [focusedNotificationId, setFocusedNotificationId] = useState<string | null>(null);
  /** INAPP-04 — origin deleted / unavailable (push fallback URL or row tap that resolves nowhere). */
  const fallbackParam = searchParams?.get("fallback");
  const fallbackFromUrl = fallbackParam === "origin_unavailable" || fallbackParam === "push_only";
  const showOriginUnavailable = fallbackFromUrl;
  const dismissOriginUnavailable = useCallback(() => {
    if (!fallbackFromUrl) return;
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.delete("fallback");
    const q = sp.toString();
    router.replace(q ? `/notifications?${q}` : "/notifications", { scroll: false });
  }, [fallbackFromUrl, router, searchParams]);

  useEffect(() => {
    setCategoryFilter(tabFromUrl);
  }, [tabFromUrl]);

  const replaceCenterUrl = useCallback(
    (nextCategory: NotificationCenterCategoryKey) => {
      if (variant !== "notification_center") return;
      const sp = new URLSearchParams();
      if (nextCategory !== "all") sp.set("tab", nextCategory);
      const q = sp.toString();
      router.replace(q ? `/notifications?${q}` : "/notifications", { scroll: false });
    },
    [router, variant]
  );

  const selectCategoryFilter = useCallback(
    (key: NotificationInboxTabKey) => {
      const next = parseCategoryTab(key);
      setCategoryFilter(next);
      replaceCenterUrl(next);
    },
    [replaceCenterUrl]
  );

  const refreshTabCounts = useCallback(async (forceFetch = false) => {
    void forceFetch;
    try {
      // INAPP-02 — server counts every unread row per tab (not only the first loaded page).
      const res = await fetch("/api/me/notifications?tab_unread_counts=1", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        tab_unread_counts?: NotificationCenterTabUnreadCounts;
      } | null;
      if (res.ok && json?.ok && json.tab_unread_counts) setTabCounts(json.tab_unread_counts);
    } catch {
      /* keep last counts */
    }
  }, []);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [offerActionBusyId, setOfferActionBusyId] = useState<string | null>(null);
  /** 알림 최종 설계 §2-4 — 탭별 「모두 읽음」 확인 창 */
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  /** 밀어서 읽음 후 안내(3초) */
  const [readToast, setReadToast] = useState(false);
  useEffect(() => {
    if (!readToast) return;
    const timer = setTimeout(() => setReadToast(false), NOTIFICATION_ACTION_TOAST_MS);
    return () => clearTimeout(timer);
  }, [readToast]);
  /** 폴링·이벤트 갱신 시 "더 보기"로 쌓인 길이를 유지하기 위한 기준 (setRows와 동기) */
  const rowsLengthRef = useRef(0);
  /**
   * INAPP-02 — server page cursor = raw rows the server returned for the current category
   * (before client A projection), so 「더 보기」 offset never skips or repeats server rows.
   */
  const serverOffsetRef = useRef(0);
  /** Drops responses from a previous category / superseded reload. */
  const loadSeqRef = useRef(0);
  const load = useCallback(
    async (silent = false, forceFetch = false, append = false, offsetForAppend = 0) => {
      const seq = append ? loadSeqRef.current : ++loadSeqRef.current;
      const isStale = () => seq !== loadSeqRef.current;
      if (!silent && !append) {
        setLoading((prev) => (prev ? prev : true));
        setError((prev) => (prev === null ? prev : null));
      }
      if (append) {
        setLoadMoreBusy((prev) => (prev ? prev : true));
      }
      const expandedSilent =
        silent && !append && serverOffsetRef.current > INBOX_PAGE_SIZE;
      const requestLimit = append
        ? INBOX_PAGE_SIZE
        : targetNotificationId
          ? 100
        : expandedSilent
          ? Math.min(serverOffsetRef.current, 100)
          : INBOX_PAGE_SIZE;
      const requestOffset = append ? offsetForAppend : 0;
      try {
        // INAPP-02: category filter + pagination run on the server (push_kind = member domain).
        const { status, json: raw } = await fetchMeNotificationsListDeduped({
          force: forceFetch,
          pushKind: categoryFilter,
          limit: requestLimit,
          offset: requestOffset,
          excludeChatMessages: true,
          excludeOwnerStoreCommerce: true,
          // 알림 최종 설계 §2-1: 종 = 안 읽은 알림만.
          unreadOnly: variant === "notification_center",
        });
        if (isStale()) return;
        const j = raw as { ok?: boolean; error?: string; notifications?: Row[]; has_more?: boolean };
        if (status === 401) {
          setPollEnabled(false);
          setError("login_required");
          rowsLengthRef.current = 0;
          serverOffsetRef.current = 0;
          setRows((prev) => (prev.length === 0 ? prev : []));
          setHasMore(false);
          return;
        }
        if (!j?.ok) {
          if (!silent && !append) {
            setError(typeof j?.error === "string" ? j.error : "load_failed");
            rowsLengthRef.current = 0;
            serverOffsetRef.current = 0;
            setRows((prev) => (prev.length === 0 ? prev : []));
          }
          setHasMore(false);
          return;
        }
        const batchRaw = (j.notifications ?? []) as Row[];
        /**
         * W5: 「더 보기」로 100행 넘게 펼친 뒤의 조용한 갱신(폴링·Realtime·화면 복귀)은 앞부분만 다시 받는다.
         * 이전에는 받은 앞부분으로 목록 전체를 바꿔 펼쳐 둔 뒷부분이 사라졌다(최대 100행으로 줄어듦).
         * 앞부분 = 서버 최신순, 뒷부분 = 앞부분의 가장 오래된 행보다 오래된 기존 행(중복 id 제외).
         */
        const keepLoadedTail = expandedSilent;
        serverOffsetRef.current = append
          ? requestOffset + batchRaw.length
          : keepLoadedTail
            ? Math.max(serverOffsetRef.current, batchRaw.length)
            : batchRaw.length;
        const batch = filterMemberNotificationAInboxRows(batchRaw) as Row[];
        setRows((prev) => {
          let next: Row[];
          if (append) {
            const seen = new Set(prev.map((r) => r.id));
            next = [...prev, ...batch.filter((r) => !seen.has(r.id))];
          } else if (keepLoadedTail) {
            const headIds = new Set(batch.map((r) => r.id));
            const oldestHead = batch.length > 0 ? batch[batch.length - 1]!.created_at : null;
            const tail = prev.filter(
              (r) => !headIds.has(r.id) && (oldestHead == null || r.created_at < oldestHead)
            );
            next = [...batch, ...tail];
          } else {
            next = batch;
          }
          rowsLengthRef.current = next.length;
          return next;
        });
        if (!keepLoadedTail) setHasMore(j?.has_more === true);
        setError(null);
        setPollEnabled(true);
        void refreshTabCounts(forceFetch);
      } catch {
        if (isStale()) return;
        if (!silent && !append) {
          setError("network_error");
          rowsLengthRef.current = 0;
          serverOffsetRef.current = 0;
          setRows((prev) => (prev.length === 0 ? prev : []));
        }
        if (!append) setHasMore(false);
      } finally {
        if (!isStale() && !silent && !append) setLoading((prev) => (prev ? false : prev));
        if (append) setLoadMoreBusy(false);
      }
    },
    [categoryFilter, refreshTabCounts, targetNotificationId, variant]
  );

  useEffect(() => {
    void load(false, true, false, 0);
  }, [load]);

  const broadcastNotificationsUpdated = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  useEffect(() => {
    const onUpdated = () => void load(true, true, false, 0);
    if (typeof window !== "undefined") {
      window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
      }
    };
  }, [load]);

  useEffect(() => {
    if (!pollEnabled) return;
    let id: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      if (document.visibilityState === "visible") {
        void load(true, true, false, 0);
      }
    };

    const arm = () => {
      if (id != null) clearInterval(id);
      id = setInterval(tick, NOTIFICATION_SYNC_POLL_MS);
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (!getSyncViewerUserIdForClient()) return;
        void load(true, true, false, 0);
        arm();
      } else if (id != null) {
        clearInterval(id);
        id = undefined;
      }
    };

    arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (id != null) clearInterval(id);
    };
  }, [load, pollEnabled]);

  useRefetchOnPageShowRestore(
    () => {
      if (!getSyncViewerUserIdForClient()) return;
      void load(true, true, false, 0);
    },
    { enableVisibilityRefetch: false }
  );

  const loadMore = useCallback(() => {
    if (!hasMore || loadMoreBusy) return;
    void load(true, false, true, serverOffsetRef.current);
  }, [hasMore, loadMoreBusy, load]);

  const markIdsRead = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    const res = await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    // U-C: 응답 JSON 이 깨져도 throw 하지 않고 실패로 처리
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (j?.ok) {
      // 알림 최종 설계 §2-1: 읽은 알림은 종에서 사라진다(기록은 DB·목적지 목록에 남음).
      setRows((prev) => {
        const next =
          variant === "notification_center"
            ? prev.filter((x) => !ids.includes(x.id))
            : prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x));
        rowsLengthRef.current = next.length;
        return next;
      });
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      return true;
    }
    return false;
  }, [broadcastNotificationsUpdated, variant]);

  /**
   * INAPP-02 — 「모두 읽음」 is enabled by the server unread count for the active tab, not only
   * by loaded rows (unread may sit past the loaded page).
   */
  const hasUnreadToMark =
    rows.some((r) => !r.is_read) || (tabCounts[categoryFilter] ?? 0) > 0;

  const markAllRead = useCallback(async () => {
    if (busy) return;
    if (!hasUnreadToMark) return;
    setBusy((prev) => (prev ? prev : true));
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Server marks every canonical A unread (selected category only on a category tab).
        body: JSON.stringify({
          mark_my_notifications_read_excluding_owner_and_chat: true,
          ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
        }),
      });
      const j = await res.json();
      if (!j?.ok) {
        setActionErrorToast(typeof j?.error === "string" ? j.error : "failed");
        return;
      }
      invalidateMeNotificationsListDedupedCache();
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      await load(true, true, false, 0);
    } catch {
      setActionErrorToast("network_error");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }, [broadcastNotificationsUpdated, busy, categoryFilter, hasUnreadToMark, load]);

  useEffect(() => {
    registerMarkAll?.(markAllRead);
  }, [markAllRead, registerMarkAll]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (
        !shouldShowNotificationCenterRowForTarget(r, categoryFilter, targetNotificationId)
      ) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, rows, targetNotificationId]);

  const grouped = useMemo(() => buildInboxGroupItems(visibleRows, language), [language, visibleRows]);
  useEffect(() => {
    onVisibleCountChange?.(grouped.length);
  }, [grouped.length, onVisibleCountChange]);

  const targetRow = useMemo(
    () => findNotificationCenterTargetRow(rows, targetNotificationId),
    [rows, targetNotificationId]
  );

  // Target may sit past the first page — chase pages until found or exhausted.
  // Missing / deleted / other-user ids: exhaust safely with no focus (no crash).
  useEffect(() => {
    if (!targetNotificationId || loading || loadMoreBusy) return;
    if (targetRow) return;
    if (!hasMore) return;
    void load(true, false, true, serverOffsetRef.current);
  }, [
    hasMore,
    load,
    loadMoreBusy,
    loading,
    rows.length,
    targetNotificationId,
    targetRow,
  ]);

  useEffect(() => {
    if (!targetNotificationId || !targetRow) return;
    setFocusedNotificationId(targetNotificationId);
    const raf = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-notification-focus-target="1"]');
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const btn = el.querySelector<HTMLButtonElement>("[data-notification-row-action]");
      btn?.focus({ preventScroll: true });
    });
    const clear = window.setTimeout(() => {
      setFocusedNotificationId((prev) => (prev === targetNotificationId ? null : prev));
    }, 2500);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(clear);
    };
  }, [targetNotificationId, targetRow]);

  const onActivate = (item: InboxGroupItem) => {
    const resolveInput = {
      inboxRow: {
        id: item.notification_id,
        notification_type: item.notification_type,
        link_url: item.href,
        meta: item.meta,
        push_kind: item.push_kind ?? null,
        bell_presentation_type: item.bell_presentation_type ?? null,
        event_type: item.event_type ?? null,
        campaign_type: item.campaign_type ?? null,
      },
      fallbackHref: defaultInboxFallbackHref(),
    };
    // INAPP-04 → 재감사 B: 원본이 없으면 activateNotificationDestination 이 알림 상세로 연다(종 팝업과 같은 결과).
    // U-G: 알림을 눌러 이동 → 뒤로 돌아오면 같은 스크롤 위치로(app/(main)/notifications/page.tsx 가 복원).
    markNotificationCenterScrollRestore();
    activateNotificationDestination({
      router,
      resolveInput,
      onBeforeNavigate: (resolvedHref) => {
        prewarmInboxNotificationChatHref(router, resolvedHref);
      },
      unreadIds: item.unreadCount > 0 ? item.ids : [],
      markRead: markIdsRead,
    });
  };

  const onItemWarm = (item: InboxGroupItem) => {
    prewarmInboxNotificationChatHref(router, item.href);
  };

  const actOnTradeOffer = useCallback(
    async (item: InboxGroupItem, action: "accept" | "reject") => {
      const meta = resolvePendingTradeOfferMeta(item);
      const offerId = meta?.offer_id?.trim() ?? "";
      if (!offerId) return;
      setOfferActionBusyId(offerId);
      try {
        const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/${action}`, {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json?.ok) {
          setActionErrorToast(typeof json?.error === "string" ? json.error : "notif_inbox_offer_action_failed");
          return;
        }
        void markIdsRead(item.ids);
        invalidateMeNotificationsListDedupedCache();
        broadcastNotificationsUpdated();
        await load(true, true, false, 0);
      } catch {
        setActionErrorToast("network_error");
      } finally {
        setOfferActionBusyId((prev) => (prev === offerId ? null : prev));
      }
    },
    [broadcastNotificationsUpdated, load, markIdsRead]
  );

  /** 오류 코드 → 문구. 알 수 없는 서버 코드는 상황별 기본 문구(「내용을 표시할 수 없습니다」 오표시 금지) */
  const notifErrorMessage = (code: string, fallbackKey: MessageKey = "notif_inbox_error_load_failed"): string => {
    const key = resolveNotifInboxErrorMessageKey(code);
    if (key) return t(key);
    if (code === "notif_inbox_offer_action_failed") return t("notif_inbox_offer_action_failed");
    return t(fallbackKey);
  };

  if (error === "login_required") {
    return <p className="text-sm text-sam-muted">{t("notif_inbox_login_required")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-sam-surface/95 px-1 py-2 backdrop-blur-sm">
        <NotificationInboxTabBar
          chips={categoryChips}
          active={categoryFilter}
          counts={tabCounts}
          onSelect={selectCategoryFilter}
          ariaLabel={t("notif_center_tabs_aria")}
        />
        {variant === "notification_center" ? (
          /* 알림 최종 설계 §2-4 — 안 읽은 알림 수 + 보고 있는 탭만 「모두 읽음」(확인 창) */
          <div className="flex min-h-9 items-center justify-between gap-2 px-0.5">
            <span className="min-w-0 truncate text-[12px] font-medium text-sam-muted tabular-nums">
              {t("notif_bell_unread_summary", { n: tabCounts[categoryFilter] ?? 0 })}
            </span>
            <button
              type="button"
              disabled={busy || loading || !hasUnreadToMark}
              title={!hasUnreadToMark ? t("notif_inbox_mark_all_disabled_hint") : undefined}
              onClick={() => setConfirmMarkAll(true)}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-ui-rect border border-sam-primary bg-sam-surface px-3 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:cursor-not-allowed disabled:border-sam-border disabled:text-sam-muted disabled:opacity-60"
            >
              {busy ? t("common_processing") : t("notif_tier1_mark_read")}
            </button>
          </div>
        ) : null}
      </div>
      <>
      {variant !== "notification_center" && rows.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || loading || !hasUnreadToMark}
            title={!hasUnreadToMark ? t("notif_inbox_mark_all_disabled_hint") : undefined}
            onClick={() => void markAllRead()}
            className="shrink-0 text-[13px] font-semibold text-sam-primary disabled:opacity-40"
          >
            {busy ? t("common_processing") : t("notif_tier1_mark_read")}
          </button>
        </div>
      ) : null}
      {showOriginUnavailable ? (
        <NotificationContentUnavailableNotice
          reason={fallbackParam === "push_only" ? "push_only" : "origin_unavailable"}
          onDismiss={dismissOriginUnavailable}
        />
      ) : null}
      {loading ? (
        <NotificationInboxRowSkeleton label={t("common_loading")} />
      ) : (
      <>
      {error ? (
        /** 로드 오류 = 본문 하나 + 다시 시도. 목록과 동시에 그리지 않는다 */
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-sm text-sam-danger">{notifErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void load(false, true)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface"
          >
            {t("common_retry")}
          </button>
        </div>
      ) : grouped.length === 0 ? (
        variant === "notification_center" ? (
          categoryFilter === "all" ? (
            <NotificationBellEmptyShortcuts />
          ) : (
            <p className="px-1 py-10 text-center text-[13px] text-sam-muted">{t("notif_category_empty")}</p>
          )
        ) : rows.length === 0 ? (
          <NotificationInboxEmptyState kind="empty" />
        ) : (
          <p className="px-1 py-10 text-center text-[13px] text-sam-muted">
            {categoryFilter !== "all" ? t("notif_category_empty") : t("notif_full_inbox_empty")}
          </p>
        )
      ) : (
      <NotificationInboxByDateSections
        items={grouped}
        onItemWarm={onItemWarm}
        onActivate={(item) => onActivate(item)}
        focusedNotificationId={focusedNotificationId}
        showDestinationHint={variant === "notification_center"}
        onSwipeRead={
          variant === "notification_center"
            ? (item) => {
                const unread = item.ids.filter((id) => rows.some((r) => r.id === id && !r.is_read));
                void markIdsRead(unread.length > 0 ? unread : item.ids).then((ok) => {
                  if (ok) setReadToast(true);
                  else setActionErrorToast("failed");
                });
              }
            : undefined
        }
        renderActions={(item) => {
          const offerMeta = resolvePendingTradeOfferMeta(item);
          const offerId = offerMeta?.offer_id?.trim() ?? "";
          if (!offerId) return null;
          const acting = offerActionBusyId === offerId;
          return (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={(e) => {
                  e.preventDefault();
                  void actOnTradeOffer(item, "accept");
                }}
                className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-sam-on-primary transition active:bg-sam-primary-active disabled:opacity-60"
              >
                {t("common_accept")}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={(e) => {
                  e.preventDefault();
                  void actOnTradeOffer(item, "reject");
                }}
                className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-60"
              >
                {t("common_reject")}
              </button>
            </div>
          );
        }}
        emptyLabel={
          categoryFilter !== "all"
            ? t("notif_category_empty")
            : variant === "notification_center"
              ? t("notif_full_inbox_empty")
              : t("common_notifications_empty")
        }
      />
      )}
      </>
      )}
      {!loading && hasMore && grouped.length > 0 ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            disabled={loadMoreBusy}
            onClick={() => void loadMore()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-medium text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-50"
          >
            {loadMoreBusy ? t("common_loading") : t("notif_inbox_load_more")}
          </button>
        </div>
      ) : null}
      </>
      <DibayConfirmDialog
        open={confirmMarkAll}
        title={t("notif_bell_mark_tab_read_confirm", {
          tab: categoryChips.find((c) => c.key === categoryFilter)?.label ?? t("notif_filter_all"),
          n: tabCounts[categoryFilter] ?? 0,
        })}
        description={t("notif_bell_mark_tab_read_hint")}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("notif_tier1_mark_read")}
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmMarkAll(false);
        }}
        onConfirm={() => {
          if (busy) return;
          void markAllRead().finally(() => setConfirmMarkAll(false));
        }}
      />
      {readToast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="notif-read-toast"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
          style={{ bottom: "calc(76px + var(--safe-bottom, 0px))" }}
        >
          <p className="max-w-[24rem] rounded-ui-rect bg-sam-fg px-4 py-3 text-center text-[13px] font-medium text-sam-surface shadow-lg">
            {t("notif_bell_read_toast")}
          </p>
        </div>
      ) : null}
      {actionErrorToast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="notif-action-error-toast"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
          style={{ bottom: "calc(76px + var(--safe-bottom, 0px))" }}
        >
          <p className="max-w-[24rem] rounded-ui-rect bg-sam-fg px-4 py-3 text-center text-[13px] font-medium text-sam-surface shadow-lg">
            {notifErrorMessage(actionErrorToast, "notif_inbox_error_failed")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
