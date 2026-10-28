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
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";
import { NotificationInboxEmptyState } from "@/components/notifications/NotificationInboxEmptyState";
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
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
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

const CATEGORY_TABS: NotificationCenterCategoryKey[] = [
  "all",
  "notice",
  "delivery",
  "trade",
  "community",
  "marketing",
  "system",
];

function parseCategoryTab(raw: string | null): NotificationCenterCategoryKey {
  // Legacy notification-center filter — not a member domain.
  if (raw === "cs" || raw === "store") return "all";
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
  /** Notification Center — selection mode controlled by page header */
  selectionMode?: boolean;
  onSelectionModeChange?: (next: boolean) => void;
  /** U-G: 보이는 알림 행 수 — 빈 목록이면 페이지 ⋯ 「선택」 비활성 */
  onVisibleCountChange?: (count: number) => void;
  registerSelectionApi?: (api: {
    selectAll: () => void;
    clearSelection: () => void;
    markSelectedRead: () => Promise<void>;
    deleteSelected: () => Promise<void>;
    selectedCount: number;
    totalCount: number;
  } | null) => void;
};

/** 행동 실패 토스트 표시 시간 — 내정보 토스트(`MYPAGE_TOAST_MS`)와 같은 3초 */
const NOTIFICATION_ACTION_TOAST_MS = 3000;

export function MyNotificationsView({
  variant = "default",
  registerMarkAll,
  selectionMode = false,
  onSelectionModeChange,
  registerSelectionApi,
  onVisibleCountChange,
}: MyNotificationsViewProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useI18n();
  const categoryChips = useMemo(
    (): { key: NotificationInboxTabKey; label: string }[] => [
      { key: "all", label: t("notif_filter_all") },
      { key: "notice", label: t("notif_filter_notice") },
      { key: "delivery", label: t("notif_filter_delivery") },
      { key: "trade", label: t("notif_filter_trade") },
      { key: "community", label: t("notif_filter_community") },
      { key: "marketing", label: t("notif_filter_marketing") },
      { key: "system", label: t("notif_filter_system") },
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
  const fallbackFromUrl = searchParams?.get("fallback") === "origin_unavailable";
  const [originUnavailableTap, setOriginUnavailableTap] = useState(false);
  const showOriginUnavailable = fallbackFromUrl || originUnavailableTap;
  const dismissOriginUnavailable = useCallback(() => {
    setOriginUnavailableTap(false);
    if (!fallbackFromUrl) return;
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.delete("fallback");
    const q = sp.toString();
    router.replace(q ? `/notifications?${q}` : "/notifications", { scroll: false });
  }, [fallbackFromUrl, router, searchParams]);

  useEffect(() => {
    setCategoryFilter(tabFromUrl);
  }, [tabFromUrl]);

  // Legacy ?tab=cs is not a member domain — strip to bare /notifications.
  useEffect(() => {
    if (variant !== "notification_center") return;
    if (searchParams?.get("tab") !== "cs") return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("tab");
    const q = sp.toString();
    router.replace(q ? `/notifications?${q}` : "/notifications", { scroll: false });
  }, [router, searchParams, variant]);

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
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InboxGroupItem | null>(null);
  const [pendingSelectedDelete, setPendingSelectedDelete] = useState(false);
  const [offerActionBusyId, setOfferActionBusyId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const pendingDeleteRef = useRef<InboxGroupItem | null>(null);
  /** 폴링·이벤트 갱신 시 "더 보기"로 쌓인 길이를 유지하기 위한 기준 (setRows와 동기) */
  const rowsLengthRef = useRef(0);
  /**
   * INAPP-02 — server page cursor = raw rows the server returned for the current category
   * (before client A projection), so 「더 보기」 offset never skips or repeats server rows.
   */
  const serverOffsetRef = useRef(0);
  /** Drops responses from a previous category / superseded reload. */
  const loadSeqRef = useRef(0);
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  useEffect(() => {
    if (!selectionMode) setSelectedKeys(new Set());
  }, [selectionMode]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [categoryFilter]);

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
        serverOffsetRef.current = append ? requestOffset + batchRaw.length : batchRaw.length;
        const batch = filterMemberNotificationAInboxRows(batchRaw) as Row[];
        setRows((prev) => {
          const seen = append ? new Set(prev.map((r) => r.id)) : null;
          const next = seen ? [...prev, ...batch.filter((r) => !seen.has(r.id))] : batch;
          rowsLengthRef.current = next.length;
          return next;
        });
        setHasMore(j?.has_more === true);
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
    [categoryFilter, refreshTabCounts, targetNotificationId]
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
      setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      return true;
    }
    return false;
  }, [broadcastNotificationsUpdated]);

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

  const requestDeleteGroup = useCallback((item: InboxGroupItem) => {
    setPendingDelete(item);
  }, []);

  const runDeleteGroup = useCallback(
    async (item: InboxGroupItem) => {
      setDeleteBusyKey(item.key);
      try {
        const res = await fetch("/api/me/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete_ids: item.ids }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !j?.ok) {
          setActionErrorToast(
            typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : "delete_failed"
          );
          return;
        }
        setRows((prev) => {
          const next = prev.filter((r) => !item.ids.includes(r.id));
          rowsLengthRef.current = next.length;
          return next;
        });
        invalidateMeNotificationsListDedupedCache();
        broadcastNotificationsUpdated();
        resyncBadgesAfterNotificationEventsRead("notification_opened");
      } catch {
        setActionErrorToast("network_error");
      } finally {
        setDeleteBusyKey((prev) => (prev === null ? prev : null));
        setPendingDelete((prev) => (prev === null ? prev : null));
      }
    },
    [broadcastNotificationsUpdated]
  );

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

  const toggleSelectItem = useCallback((item: InboxGroupItem) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedKeys(new Set(grouped.map((g) => g.key)));
  }, [grouped]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const markSelectedRead = useCallback(async () => {
    if (busy) return;
    const ids = grouped.filter((g) => selectedKeys.has(g.key)).flatMap((g) => g.ids);
    const unreadIds = ids.filter((id) => rows.some((r) => r.id === id && !r.is_read));
    if (unreadIds.length === 0) return;
    setBusy(true);
    try {
      const ok = await markIdsRead(unreadIds);
      if (ok) setSelectedKeys(new Set());
      // U-C: 선택 읽음 실패도 다른 동작과 같은 실패 토스트
      else setActionErrorToast("failed");
    } catch {
      setActionErrorToast("network_error");
    } finally {
      setBusy(false);
    }
  }, [busy, grouped, markIdsRead, rows, selectedKeys]);

  const deleteSelected = useCallback(async () => {
    if (busy) return;
    const ids = grouped.filter((g) => selectedKeys.has(g.key)).flatMap((g) => g.ids);
    if (ids.length === 0) return;
    setBusy(true);
    setDeleteBusyKey("__selection__");
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete_ids: ids }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        setPendingSelectedDelete(false);
        setActionErrorToast(typeof j.error === "string" ? j.error : "delete_failed");
        return;
      }
      setRows((prev) => {
        const next = prev.filter((r) => !ids.includes(r.id));
        rowsLengthRef.current = next.length;
        return next;
      });
      setSelectedKeys(new Set());
      setPendingSelectedDelete(false);
      onSelectionModeChange?.(false);
      invalidateMeNotificationsListDedupedCache();
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
    } catch {
      setActionErrorToast("network_error");
    } finally {
      setBusy(false);
      setDeleteBusyKey(null);
    }
  }, [broadcastNotificationsUpdated, busy, grouped, onSelectionModeChange, selectedKeys]);

  useEffect(() => {
    if (!registerSelectionApi) return;
    if (variant !== "notification_center") {
      registerSelectionApi(null);
      return;
    }
    registerSelectionApi({
      selectAll: selectAllVisible,
      clearSelection,
      markSelectedRead,
      deleteSelected,
      selectedCount: selectedKeys.size,
      totalCount: grouped.length,
    });
    return () => registerSelectionApi(null);
  }, [
    clearSelection,
    deleteSelected,
    grouped.length,
    markSelectedRead,
    registerSelectionApi,
    selectAllVisible,
    selectedKeys.size,
    variant,
  ]);

  const pendingDeleteMessage = useMemo(() => {
    if (!pendingDelete) return "";
    return pendingDelete.ids.length > 1
      ? t("notif_inbox_delete_group_confirm", { n: pendingDelete.ids.length })
      : t("notif_inbox_delete_confirm");
  }, [pendingDelete, t]);

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
    // INAPP-04: origin deleted / unresolvable → standard notice here (navigating to the
    // fallback would silently land on this same list). Read-on-open semantics unchanged.
    if (resolveNotificationDestination(resolveInput).kind === "inbox_fallback") {
      if (item.unreadCount > 0) void markIdsRead(item.ids);
      setOriginUnavailableTap(true);
      return;
    }
    setOriginUnavailableTap(false);
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
        {variant === "notification_center" && !selectionMode ? (
          /* U-03 — 미읽음 수 안내 + 외곽선 버튼(눌림·비활성 상태) · 범위 = 현재 탭 */
          <div className="flex min-h-9 items-center justify-between gap-2 px-0.5">
            <span className="min-w-0 truncate text-[12px] font-medium text-sam-muted tabular-nums">
              {t("notif_center_unread_summary", { n: tabCounts[categoryFilter] ?? 0 })}
            </span>
            <button
              type="button"
              disabled={busy || loading || !hasUnreadToMark}
              title={!hasUnreadToMark ? t("notif_inbox_mark_all_disabled_hint") : undefined}
              onClick={() => void markAllRead()}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-ui-rect border border-sam-primary bg-sam-surface px-3 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:cursor-not-allowed disabled:border-sam-border disabled:text-sam-muted disabled:opacity-60"
            >
              {busy ? t("common_processing") : t("notif_tier1_mark_read")}
            </button>
          </div>
        ) : null}
        {variant === "notification_center" && selectionMode ? (
          /* U-02 — 선택 모드 CTA 는 이 한 줄만 (헤더 = 취소). 탭 sticky 안에 있어 겹치지 않음 */
          <div
            role="toolbar"
            aria-label={t("notif_center_selection_toolbar")}
            className="flex min-h-9 items-center justify-between gap-2 px-0.5"
          >
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[13px] font-semibold text-sam-fg tabular-nums">
                {t("notif_center_selected_n", { n: selectedKeys.size })}
              </span>
              <button
                type="button"
                disabled={busy || grouped.length === 0}
                onClick={() =>
                  selectedKeys.size === grouped.length ? clearSelection() : selectAllVisible()
                }
                className="inline-flex h-8 shrink-0 items-center rounded-ui-rect px-2 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:opacity-40"
              >
                {selectedKeys.size > 0 && selectedKeys.size === grouped.length
                  ? t("notif_center_deselect_all")
                  : t("notif_center_select_all")}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busy || selectedKeys.size === 0}
                onClick={() => void markSelectedRead()}
                className="inline-flex h-8 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
              >
                {t("notif_center_mark_read_action")}
              </button>
              <button
                type="button"
                disabled={busy || selectedKeys.size === 0}
                onClick={() => setPendingSelectedDelete(true)}
                className="inline-flex h-8 items-center justify-center rounded-ui-rect border border-sam-danger bg-sam-danger px-3 text-[13px] font-semibold text-sam-on-primary transition active:opacity-85 disabled:opacity-40"
              >
                {t("notif_center_delete_n", { n: selectedKeys.size })}
              </button>
            </div>
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
        <NotificationContentUnavailableNotice onDismiss={dismissOriginUnavailable} />
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
        rows.length === 0 ? (
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
        selectionMode={variant === "notification_center" && selectionMode}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleSelectItem}
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
        onDelete={
          variant === "notification_center" && selectionMode
            ? undefined
            : (item) => requestDeleteGroup(item)
        }
        deleteBusyKey={deleteBusyKey}
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
      <NotificationDeleteConfirmDialog
        open={pendingDelete != null}
        message={pendingDeleteMessage}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={pendingDelete != null && deleteBusyKey === pendingDelete.key}
        onCancel={() => setPendingDelete((prev) => (prev === null ? prev : null))}
        onConfirm={() => {
          const item = pendingDeleteRef.current;
          if (item) void runDeleteGroup(item);
        }}
      />
      <NotificationDeleteConfirmDialog
        open={pendingSelectedDelete}
        message={t("notif_center_delete_selected_confirm", { n: selectedKeys.size })}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={busy && deleteBusyKey === "__selection__"}
        onCancel={() => setPendingSelectedDelete(false)}
        onConfirm={() => {
          void deleteSelected();
        }}
      />
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
