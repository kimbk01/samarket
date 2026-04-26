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
import {
  prewarmChatRouteData,
  shouldWarmChatRoute,
} from "@/lib/chats/prewarm-chat-room-route";
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

export function MyNotificationsView() {
  const router = useRouter();
  const { language, t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InboxGroupItem | null>(null);
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

  async function markIdsRead(ids: string[]) {
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
  }

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

  const prewarmIfChat = (href: string) => {
    if (!shouldWarmChatRoute(href)) return;
    void router.prefetch(href);
    prewarmChatRouteData(href);
  };

  const onActivate = async (item: InboxGroupItem) => {
    if (item.unreadCount > 0) {
      await markIdsRead(item.ids);
    }
    prewarmIfChat(item.href);
    router.push(item.href);
  };

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
        onActivate={(item) => void onActivate(item)}
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
