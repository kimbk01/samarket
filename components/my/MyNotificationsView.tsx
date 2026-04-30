"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
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
};

type TradeOfferNotificationMeta = {
  kind?: string;
  event?: string;
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
    meta?.event === "offer_created" || meta?.spec_type === "offer_created";
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
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InboxGroupItem | null>(null);
  const [offerActionBusyId, setOfferActionBusyId] = useState<string | null>(null);
  const pendingDeleteRef = useRef<InboxGroupItem | null>(null);
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  const load = useCallback(async (silent = false, forceFetch = false) => {
    if (!silent) {
      setLoading((prev) => (prev ? prev : true));
      setError((prev) => (prev === null ? prev : null));
    }
    try {
      const { status, json: raw } = await fetchMeNotificationsListDeduped({
        force: forceFetch,
      });
      const j = raw as { ok?: boolean; error?: string; notifications?: Row[] };
      if (status === 401) {
        setError("로그인이 필요합니다.");
        setRows((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      if (!j?.ok) {
        if (!silent) {
          setError(typeof j?.error === "string" ? j.error : "load_failed");
          setRows((prev) => (prev.length === 0 ? prev : []));
        }
        return;
      }
      setRows((j.notifications ?? []) as Row[]);
      setError(null);
    } catch {
      if (!silent) {
        setError("network_error");
        setRows((prev) => (prev.length === 0 ? prev : []));
      }
    } finally {
      if (!silent) setLoading((prev) => (prev ? false : prev));
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const broadcastNotificationsUpdated = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  useEffect(() => {
    const onUpdated = () => void load(true, true);
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
        void load(true);
      }
    };

    const arm = () => {
      if (id != null) clearInterval(id);
      id = setInterval(tick, NOTIFICATION_SYNC_POLL_MS);
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load(true);
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

  useRefetchOnPageShowRestore(() => void load(true, true), { enableVisibilityRefetch: false });

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
      await load(true, true);
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
        setRows((prev) => prev.filter((r) => !item.ids.includes(r.id)));
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
        await load(true, true);
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
