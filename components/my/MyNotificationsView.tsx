"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
};

const INBOX_PAGE_SIZE = 40;

const INBOX_FILTER_CHIPS: { key: InboxPushKindFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "trade", label: "거래" },
  { key: "chat", label: "채팅" },
  { key: "notice", label: "공지" },
  { key: "marketing", label: "광고" },
];

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

export function MyNotificationsView() {
  const router = useRouter();
  const { language, t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterTab, setFilterTab] = useState<InboxPushKindFilter>("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InboxGroupItem | null>(null);
  const [offerActionBusyId, setOfferActionBusyId] = useState<string | null>(null);
  const pendingDeleteRef = useRef<InboxGroupItem | null>(null);
  /** 폴링·이벤트 갱신 시 "더 보기"로 쌓인 길이를 유지하기 위한 기준 (setRows와 동기) */
  const rowsLengthRef = useRef(0);
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

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
        });
        const j = raw as { ok?: boolean; error?: string; notifications?: Row[]; has_more?: boolean };
        if (status === 401) {
          setError("로그인이 필요합니다.");
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
        const batch = (j.notifications ?? []) as Row[];
        setRows((prev) => {
          const next = append ? [...prev, ...batch] : batch;
          rowsLengthRef.current = next.length;
          return next;
        });
        setHasMore(j?.has_more === true);
        setError(null);
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
  }, [load]);

  useRefetchOnPageShowRestore(() => void load(true, true, false, 0), { enableVisibilityRefetch: false });

  const loadMore = useCallback(() => {
    if (!hasMore || loadMoreBusy) return;
    void load(true, false, true, rows.length);
  }, [hasMore, loadMoreBusy, load, rows.length]);

  const markIdsRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
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
    }
  }, [broadcastNotificationsUpdated]);

  async function markAllRead() {
    if (!rows.some((r) => !r.is_read)) return;
    setBusy((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_my_notifications_read_excluding_owner_commerce: true }),
      });
      const j = await res.json();
      if (!j?.ok) {
        setError(typeof j?.error === "string" ? j.error : "failed");
        return;
      }
      invalidateMeNotificationsListDedupedCache();
      broadcastNotificationsUpdated();
      await load(true, true, false, 0);
    } catch {
      setError("network_error");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }

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

  const pendingDeleteMessage = useMemo(() => {
    if (!pendingDelete) return "";
    return pendingDelete.ids.length > 1
      ? t("notif_inbox_delete_group_confirm", { n: pendingDelete.ids.length })
      : t("notif_inbox_delete_confirm");
  }, [pendingDelete, t]);

  const onActivate = (item: InboxGroupItem) => {
    prewarmInboxNotificationChatHref(router, item.href);
    void router.push(item.href);
    if (item.unreadCount > 0) {
      void markIdsRead(item.ids);
    }
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
          setError(typeof json?.error === "string" ? json.error : "가격 제안을 처리하지 못했습니다.");
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
    [broadcastNotificationsUpdated, load, markIdsRead]
  );

  if (loading) {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }

  if (error === "로그인이 필요합니다.") {
    return <p className="text-sm text-sam-muted">{error}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {INBOX_FILTER_CHIPS.map(({ key, label }) => (
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
      {rows.length > 0 ? (
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
      {error ? <p className="text-sm text-red-600">({error})</p> : null}
      <NotificationInboxByDateSections
        items={grouped}
        onItemWarm={onItemWarm}
        onActivate={(item) => onActivate(item)}
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
                수락
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
                거절
              </button>
            </div>
          );
        }}
        onDelete={(item) => requestDeleteGroup(item)}
        deleteBusyKey={deleteBusyKey}
        emptyLabel={t("common_notifications_empty")}
      />
      {hasMore ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            disabled={loadMoreBusy}
            onClick={() => void loadMore()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-medium text-sam-fg disabled:opacity-50"
          >
            {loadMoreBusy ? "불러오는 중…" : "더 보기"}
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
    </div>
  );
}
