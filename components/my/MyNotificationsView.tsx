"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { KASAMA_NOTIFICATIONS_UPDATED, NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";
import {
  fetchMeNotificationsListDeduped,
  invalidateMeNotificationsListDedupedCache,
  type InboxPushKindFilter,
} from "@/lib/me/fetch-me-notifications-deduped";
import { prewarmInboxNotificationChatHref } from "@/lib/notifications/prewarm-inbox-notification-href";
import { buildInboxGroupItems, type InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";
import { resolveNotifInboxErrorMessageKey } from "@/lib/notifications/resolve-notif-inbox-error-message";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import type { BellPresentationType } from "@/lib/notifications/inbox-events-merge";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";

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
};

const INBOX_PAGE_SIZE = 40;

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
  onOpenDetail?: (notificationId: string) => void;
  /** Notification Center — selection mode controlled by page header */
  selectionMode?: boolean;
  onSelectionModeChange?: (next: boolean) => void;
  registerSelectionApi?: (api: {
    selectAll: () => void;
    clearSelection: () => void;
    markSelectedRead: () => Promise<void>;
    deleteSelected: () => Promise<void>;
    selectedCount: number;
    totalCount: number;
  } | null) => void;
};

export function MyNotificationsView({
  variant = "default",
  registerMarkAll,
  onOpenDetail,
  selectionMode = false,
  onSelectionModeChange,
  registerSelectionApi,
}: MyNotificationsViewProps = {}) {
  const router = useRouter();
  const { language, t } = useI18n();
  const inboxFilterChips = useMemo(
    (): { key: InboxPushKindFilter; label: string }[] => [
      // Gate 3 Step 8 — A filters only (no chat).
      { key: "all", label: t("notif_filter_all") },
      { key: "trade", label: t("notif_filter_trade") },
      { key: "delivery", label: t("notif_filter_delivery") },
      { key: "system", label: t("notif_filter_system") },
      { key: "marketing", label: t("notif_filter_benefit") },
    ],
    [t]
  );
  const [pollEnabled, setPollEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterTab, setFilterTab] = useState<InboxPushKindFilter>("all");
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
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  useEffect(() => {
    if (!selectionMode) setSelectedKeys(new Set());
  }, [selectionMode]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [filterTab]);

  const load = useCallback(
    async (silent = false, forceFetch = false, append = false, offsetForAppend = 0) => {
      if (!silent && !append) {
        setLoading((prev) => (prev ? prev : true));
        setError((prev) => (prev === null ? prev : null));
      }
      if (append) {
        setLoadMoreBusy((prev) => (prev ? prev : true));
      }
      const expandedSilent =
        silent && !append && rowsLengthRef.current > INBOX_PAGE_SIZE;
      const requestLimit = append
        ? INBOX_PAGE_SIZE
        : expandedSilent
          ? Math.min(rowsLengthRef.current, 100)
          : INBOX_PAGE_SIZE;
      const requestOffset = append ? offsetForAppend : 0;
      try {
        const { status, json: raw } = await fetchMeNotificationsListDeduped({
          force: forceFetch,
          pushKind: filterTab,
          limit: requestLimit,
          offset: requestOffset,
          excludeChatMessages: true,
          excludeOwnerStoreCommerce: true,
        });
        const j = raw as { ok?: boolean; error?: string; notifications?: Row[]; has_more?: boolean };
        if (status === 401) {
          setPollEnabled(false);
          setError("login_required");
          rowsLengthRef.current = 0;
          setRows((prev) => (prev.length === 0 ? prev : []));
          setHasMore(false);
          return;
        }
        if (!j?.ok) {
          if (!silent && !append) {
            setError(typeof j?.error === "string" ? j.error : "load_failed");
            rowsLengthRef.current = 0;
            setRows((prev) => (prev.length === 0 ? prev : []));
          }
          setHasMore(false);
          return;
        }
        const batchRaw = (j.notifications ?? []) as Row[];
        const batch = filterMemberNotificationAInboxRows(batchRaw) as Row[];
        setRows((prev) => {
          const next = append ? [...prev, ...batch] : batch;
          rowsLengthRef.current = next.length;
          return next;
        });
        setHasMore(j?.has_more === true);
        setError(null);
        setPollEnabled(true);
      } catch {
        if (!silent && !append) {
          setError("network_error");
          rowsLengthRef.current = 0;
          setRows((prev) => (prev.length === 0 ? prev : []));
        }
        if (!append) setHasMore(false);
      } finally {
        if (!silent && !append) setLoading((prev) => (prev ? false : prev));
        if (append) setLoadMoreBusy(false);
      }
    },
    [filterTab]
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
    void load(true, false, true, rows.length);
  }, [hasMore, loadMoreBusy, load, rows.length]);

  const markIdsRead = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    const res = await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const j = await res.json();
    if (j?.ok) {
      setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      return true;
    }
    return false;
  }, [broadcastNotificationsUpdated]);

  const markAllRead = useCallback(async () => {
    if (busy) return;
    if (!rows.some((r) => !r.is_read)) return;
    setBusy((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_my_notifications_read_excluding_owner_and_chat: true }),
      });
      const j = await res.json();
      if (!j?.ok) {
        setError(typeof j?.error === "string" ? j.error : "failed");
        return;
      }
      invalidateMeNotificationsListDedupedCache();
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      await load(true, true, false, 0);
    } catch {
      setError("network_error");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }, [broadcastNotificationsUpdated, busy, load, rows]);

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
          setError(typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : "delete_failed");
          return;
        }
        setRows((prev) => {
          const next = prev.filter((r) => !item.ids.includes(r.id));
          rowsLengthRef.current = next.length;
          return next;
        });
        setError((prev) => (prev === null ? prev : null));
        invalidateMeNotificationsListDedupedCache();
        broadcastNotificationsUpdated();
        resyncBadgesAfterNotificationEventsRead("notification_opened");
      } catch {
        setError("network_error");
      } finally {
        setDeleteBusyKey((prev) => (prev === null ? prev : null));
        setPendingDelete((prev) => (prev === null ? prev : null));
      }
    },
    [broadcastNotificationsUpdated]
  );

  const grouped = useMemo(() => buildInboxGroupItems(rows, language), [rows, language]);

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
        setError(typeof j.error === "string" ? j.error : "delete_failed");
        return;
      }
      setRows((prev) => {
        const next = prev.filter((r) => !ids.includes(r.id));
        rowsLengthRef.current = next.length;
        return next;
      });
      setSelectedKeys(new Set());
      setPendingSelectedDelete(false);
      invalidateMeNotificationsListDedupedCache();
      broadcastNotificationsUpdated();
      resyncBadgesAfterNotificationEventsRead("notification_opened");
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
      setDeleteBusyKey(null);
    }
  }, [broadcastNotificationsUpdated, busy, grouped, selectedKeys]);

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
      deleteSelected: async () => {
        setPendingSelectedDelete(true);
      },
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
    void (async () => {
      prewarmInboxNotificationChatHref(router, item.href);
      if (item.unreadCount > 0) {
        const ok = await markIdsRead(item.ids);
        if (!ok) return;
      }
      const primaryId = item.ids[0] ?? "";
      const nType = String(item.notification_type ?? "");
      const isAnnouncement =
        nType === "admin_notice" || nType === "admin_announcement" || nType.includes("admin_notice");
      if (variant === "notification_center" && isAnnouncement && primaryId && onOpenDetail) {
        onOpenDetail(primaryId);
        return;
      }
      try {
        router.push(item.href);
      } catch {
        /* read state already committed */
      }
    })();
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
      setError((prev) => (prev === null ? prev : null));
      try {
        const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/${action}`, {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json?.ok) {
          setError(typeof json?.error === "string" ? json.error : t("notif_inbox_offer_action_failed"));
          return;
        }
        void markIdsRead(item.ids);
        invalidateMeNotificationsListDedupedCache();
        broadcastNotificationsUpdated();
        await load(true, true, false, 0);
      } catch {
        setError("network_error");
      } finally {
        setOfferActionBusyId((prev) => (prev === offerId ? null : prev));
      }
    },
    [broadcastNotificationsUpdated, load, markIdsRead, t]
  );

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  if (error === "login_required") {
    return <p className="text-sm text-sam-muted">{t("notif_inbox_login_required")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {inboxFilterChips.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterTab(key)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              filterTab === key ? "bg-signature text-white" : "bg-sam-surface-muted text-sam-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {variant === "notification_center" && selectionMode && grouped.length > 0 ? (
        <div
          role="toolbar"
          aria-label={t("notif_center_selection_toolbar")}
          className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2"
        >
          <span className="px-1 text-[12px] font-medium text-sam-muted">
            {t("notif_center_selected_n", { n: selectedKeys.size })}
          </span>
          <button
            type="button"
            disabled={busy || grouped.length === 0}
            onClick={() =>
              selectedKeys.size === grouped.length ? clearSelection() : selectAllVisible()
            }
            className="rounded-ui-rect bg-sam-surface-muted px-2.5 py-1.5 text-[12px] font-medium text-sam-fg disabled:opacity-50"
          >
            {selectedKeys.size === grouped.length
              ? t("notif_center_deselect_all")
              : t("notif_center_select_all")}
          </button>
          <button
            type="button"
            disabled={busy || selectedKeys.size === 0}
            onClick={() => void markSelectedRead()}
            className="rounded-ui-rect bg-sam-surface-muted px-2.5 py-1.5 text-[12px] font-medium text-sam-fg disabled:opacity-50"
          >
            {t("notif_center_mark_selected_read")}
          </button>
          <button
            type="button"
            disabled={busy || selectedKeys.size === 0}
            onClick={() => setPendingSelectedDelete(true)}
            className="rounded-ui-rect bg-sam-surface-muted px-2.5 py-1.5 text-[12px] font-medium text-red-700 disabled:opacity-50"
          >
            {t("notif_center_delete_selected")}
          </button>
          <button
            type="button"
            disabled={busy || !rows.some((r) => !r.is_read)}
            onClick={() => void markAllRead()}
            className="rounded-ui-rect bg-sam-surface-muted px-2.5 py-1.5 text-[12px] font-medium text-sam-fg disabled:opacity-50"
          >
            {t("notif_tier1_mark_read")}
          </button>
        </div>
      ) : null}
      {variant !== "notification_center" && rows.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || !rows.some((r) => !r.is_read)}
            title={!rows.some((r) => !r.is_read) ? t("notif_inbox_mark_all_disabled_hint") : undefined}
            onClick={() => void markAllRead()}
            className="shrink-0 rounded-ui-rect border-0 bg-sam-surface-muted px-3 py-1.5 text-[12px] font-medium text-sam-fg disabled:opacity-50"
          >
            {busy ? t("common_processing") : t("notif_tier1_mark_read")}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600">
          {(() => {
            const key = resolveNotifInboxErrorMessageKey(error);
            return key ? t(key) : t("common_content_unavailable");
          })()}
        </p>
      ) : null}
      <NotificationInboxByDateSections
        items={grouped}
        onItemWarm={onItemWarm}
        onActivate={(item) => onActivate(item)}
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
                className="rounded-ui-rect bg-sam-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
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
                className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] font-semibold text-sam-fg disabled:opacity-60"
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
          variant === "notification_center"
            ? `${t("notif_center_empty_title")} ${t("notif_center_empty_body")}`
            : t("common_notifications_empty")
        }
      />
      {hasMore ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            disabled={loadMoreBusy}
            onClick={() => void loadMore()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-medium text-sam-fg disabled:opacity-50"
          >
            {loadMoreBusy ? t("common_loading") : t("notif_inbox_load_more")}
          </button>
        </div>
      ) : null}
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
        message={t("notif_center_delete_selected_confirm")}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={busy && deleteBusyKey === "__selection__"}
        onCancel={() => setPendingSelectedDelete(false)}
        onConfirm={() => {
          void deleteSelected();
        }}
      />
    </div>
  );
}
