"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import { INBOX_ROW_UNREAD_BG } from "@/lib/notifications/inbox-row-read-state";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  commerceMetaKindLabel,
  notificationTypeLabel,
} from "@/lib/notifications/notification-display-labels";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import {
  fetchMeOwnerStoreNotificationsDeduped,
  invalidateMeOwnerStoreNotificationsCache,
} from "@/lib/me/fetch-me-owner-store-notifications";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type Row = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type OwnerNotifTab = "all" | "new_orders" | "cancel_payment" | "refund";

const GROUPS: { id: Exclude<OwnerNotifTab, "all">; match: (r: Row) => boolean }[] = [
  { id: "new_orders", match: (r) => (r.meta as { kind?: string } | undefined)?.kind === "store_order_created" },
  {
    id: "cancel_payment",
    match: (r) =>
      ["store_order_buyer_cancelled", "store_order_payment_completed", "store_order_payment_failed"].includes(
        String((r.meta as { kind?: string } | undefined)?.kind)
      ),
  },
  {
    id: "refund",
    match: (r) =>
      ["store_order_refund_requested", "store_order_refund_approved"].includes(
        String((r.meta as { kind?: string } | undefined)?.kind)
      ),
  },
];

const GROUP_TAB_LABEL_KEY: Record<Exclude<OwnerNotifTab, "all">, MessageKey> = {
  new_orders: "store_owner_notif_group_new_orders",
  cancel_payment: "store_owner_notif_group_cancel_payment",
  refund: "store_owner_notif_group_refund",
};

export function OwnerNotificationList({
  slug: _slug,
  storeId,
}: {
  slug: string;
  storeId: string;
}) {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OwnerNotifTab>("all");
  const [markBusy, setMarkBusy] = useState(false);
  /** 회원 알림센터와 같은 선택·삭제 규칙 (요구사항 누락 보완) — API `delete_ids` 소프트 삭제 */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(false), 3000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const load = useCallback(
    async (silent = false, force = false) => {
      if (!silent) {
        setLoading((prev) => (prev ? prev : true));
        setError((prev) => (prev === null ? prev : null));
      }
      try {
        const { status, json } = await fetchMeOwnerStoreNotificationsDeduped(storeId, { force });
        const j = json as { ok?: boolean; notifications?: Row[]; error?: string };
        if (status === 401) {
          setError("login_required");
          setRows([]);
          return;
        }
        if (!j?.ok) {
          if (!silent) {
            setError(typeof j?.error === "string" ? j.error : "load_failed");
            setRows([]);
          }
          return;
        }
        setRows((j.notifications ?? []) as Row[]);
        setError(null);
      } catch {
        if (!silent) {
          setError("network_error");
          setRows([]);
        }
      } finally {
        if (!silent) setLoading((prev) => (prev ? false : prev));
      }
    },
    [storeId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

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
      if (document.visibilityState === "visible") void load(true, true);
    };
    const arm = () => {
      if (id != null) clearInterval(id);
      id = setInterval(tick, NOTIFICATION_SYNC_POLL_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load(true, true);
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

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    const g = GROUPS.find((x) => x.id === tab);
    if (!g) return rows;
    return rows.filter((r) => g.match(r));
  }, [rows, tab]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.is_read).length, [rows]);

  const broadcast = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  const markOneRead = async (id: string) => {
    const res = await runSingleFlight(`store-owner:notifications:mark-read:${id}`, () =>
      fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      })
    );
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (j?.ok) {
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
      invalidateMeOwnerStoreNotificationsCache(storeId);
      broadcast();
    }
  };

  const markAllForStoreRead = async () => {
    const unread = rows.filter((r) => !r.is_read).map((r) => r.id);
    if (unread.length === 0) return;
    const unreadKey = [...unread].sort().join(",");
    setMarkBusy((prev) => (prev ? prev : true));
    try {
      const res = await runSingleFlight(`store-owner:notifications:mark-read-all:${unreadKey}`, () =>
        fetch("/api/me/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unread }),
        })
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (j?.ok) {
        setRows((prev) => prev.map((x) => (!x.is_read ? { ...x, is_read: true } : x)));
        invalidateMeOwnerStoreNotificationsCache(storeId);
        broadcast();
      }
    } finally {
      setMarkBusy((prev) => (prev ? false : prev));
    }
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markSelectedRead = async () => {
    const ids = filtered.filter((r) => selectedIds.has(r.id) && !r.is_read).map((r) => r.id);
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !j?.ok) {
        setActionError(true);
        return;
      }
      setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));
      setSelectedIds(new Set());
      invalidateMeOwnerStoreNotificationsCache(storeId);
      broadcast();
    } catch {
      setActionError(true);
    } finally {
      setActionBusy(false);
    }
  };

  const runDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete_ids: ids }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !j?.ok) {
        setActionError(true);
        return;
      }
      setRows((prev) => prev.filter((x) => !ids.includes(x.id)));
      exitSelection();
      invalidateMeOwnerStoreNotificationsCache(storeId);
      broadcast();
    } catch {
      setActionError(true);
    } finally {
      setActionBusy(false);
      setPendingDeleteIds(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  if (error === "login_required") {
    return (
      <p className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-4 text-sm text-sam-fg">
        {t("store_owner_notif_login_to_view")}
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft p-4 text-sm text-sam-danger">
        {resolveOwnerApiErrorMessage(error, t)}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 ? (
        <p className="sam-text-xxs font-semibold text-sam-fg">
          {t("store_owner_notif_inbox_unread", { count: String(unreadCount) })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {(["all", ...GROUPS.map((g) => g.id)] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => {
              setTab((prev) => (prev === tabId ? prev : tabId));
              setSelectedIds(new Set());
            }}
            className={`rounded-full px-3 py-1 sam-text-xxs font-semibold transition ${
              tab === tabId
                ? "bg-sam-ink text-sam-on-primary"
                : "bg-sam-surface text-sam-fg ring-1 ring-sam-border active:bg-sam-pressed-surface"
            }`}
          >
            {tabId === "all"
              ? t("store_owner_notif_tab_all")
              : t(GROUP_TAB_LABEL_KEY[tabId as Exclude<OwnerNotifTab, "all">])}
          </button>
        ))}
      </div>
      {selectionMode ? (
        <div role="toolbar" aria-label={t("notif_center_selection_toolbar")} className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              disabled={actionBusy}
              onClick={exitSelection}
              className="inline-flex h-8 items-center rounded-ui-rect px-2 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
            >
              {t("notif_center_cancel_selection")}
            </button>
            <span className="truncate text-[13px] font-semibold text-sam-fg tabular-nums">
              {t("notif_center_selected_n", { n: selectedIds.size })}
            </span>
            <button
              type="button"
              disabled={actionBusy || filtered.length === 0}
              onClick={() =>
                setSelectedIds(
                  selectedIds.size > 0 && selectedIds.size === filtered.length
                    ? new Set()
                    : new Set(filtered.map((r) => r.id))
                )
              }
              className="inline-flex h-8 shrink-0 items-center rounded-ui-rect px-2 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:opacity-40"
            >
              {selectedIds.size > 0 && selectedIds.size === filtered.length
                ? t("notif_center_deselect_all")
                : t("notif_center_select_all")}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={actionBusy || selectedIds.size === 0}
              onClick={() => void markSelectedRead()}
              className="inline-flex h-8 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
            >
              {t("notif_center_mark_read_action")}
            </button>
            <button
              type="button"
              disabled={actionBusy || selectedIds.size === 0}
              onClick={() => setPendingDeleteIds([...selectedIds])}
              className="inline-flex h-8 items-center rounded-ui-rect border border-sam-danger bg-sam-danger px-3 text-[13px] font-semibold text-sam-on-primary transition active:opacity-85 disabled:opacity-40"
            >
              {t("notif_center_delete_n", { n: selectedIds.size })}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={filtered.length === 0}
            className="inline-flex h-8 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-semibold text-sam-fg transition active:bg-sam-pressed-surface disabled:opacity-40"
            onClick={() => setSelectionMode(true)}
          >
            {t("notif_center_select")}
          </button>
          <button
            type="button"
            disabled={markBusy || rows.every((r) => r.is_read)}
            className="inline-flex h-8 items-center rounded-ui-rect border border-sam-primary bg-sam-surface px-3 text-[13px] font-semibold text-sam-primary transition active:bg-sam-primary-soft disabled:border-sam-border disabled:text-sam-muted disabled:opacity-60"
            onClick={() => void markAllForStoreRead()}
          >
            {markBusy ? t("store_owner_notif_mark_all_busy") : t("store_owner_notif_mark_all_read")}
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-sm text-sam-muted ring-1 ring-sam-border-soft">
          {t("store_owner_notif_empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const kind = (r.meta as { kind?: string } | undefined)?.kind;
            const kindLabel = commerceMetaKindLabel(kind, language);
            const typeLabel = notificationTypeLabel(r.notification_type, language);
            const orderId = String((r.meta as { order_id?: string } | undefined)?.order_id ?? "").trim();
            const orderNo = String((r.meta as { order_no?: string } | undefined)?.order_no ?? "").trim();
            const orderStatus = String(
              (r.meta as { order_status?: string } | undefined)?.order_status ?? ""
            ).trim();
            const href =
              orderId.length > 0
                ? buildOwnerStoreOrderNotificationHref({
                    storeId,
                    orderId,
                    kind,
                    orderStatus: orderStatus || undefined,
                    ackOwnerNotifications: true,
                  })
                : r.link_url?.trim() || buildStoreOrdersHref({ storeId });

            return (
              <li
                key={r.id}
                className={`flex gap-2 overflow-hidden rounded-ui-rect border px-3 py-3 ${
                  selectionMode && selectedIds.has(r.id)
                    ? "relative border-sam-primary bg-sam-surface ring-1 ring-inset ring-sam-primary"
                    : !r.is_read
                      ? `border-sam-border ${INBOX_ROW_UNREAD_BG}`
                      : "border-sam-border-soft bg-sam-surface"
                }`}
              >
                {selectionMode ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selectedIds.has(r.id)}
                    aria-label={t("notif_center_select_row_aria")}
                    onClick={() => toggleSelected(r.id)}
                    className="-my-1 -ml-1 flex shrink-0 items-start justify-center p-1 pt-1.5"
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 items-center justify-center rounded-ui-rect border-2 text-[12px] font-bold ${
                        selectedIds.has(r.id)
                          ? "border-sam-primary bg-sam-primary text-sam-on-primary"
                          : "border-sam-border bg-sam-surface"
                      }`}
                    >
                      {selectedIds.has(r.id) ? "✓" : null}
                    </span>
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-1 sam-text-xxs text-sam-meta">
                  <span>
                    {kindLabel ?? typeLabel}
                    {kindLabel ? <span className="text-sam-muted"> · {typeLabel}</span> : null}
                  </span>
                  <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-sam-fg">{r.title}</p>
                {orderNo ? (
                  <p className="mt-0.5 sam-text-xxs text-sam-muted">
                    {t("store_owner_notif_order_no_label", { orderNo })}
                  </p>
                ) : null}
                {r.body ? <p className="mt-0.5 sam-text-body-secondary text-sam-fg">{r.body}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={href}
                    className="text-xs font-medium text-signature underline"
                    onClick={() => {
                      if (!r.is_read) void markOneRead(r.id);
                    }}
                  >
                    {t("store_owner_notif_view_order")}
                  </Link>
                  {!r.is_read ? (
                    <button
                      type="button"
                      className="rounded-ui-rect text-xs text-sam-muted underline active:bg-sam-pressed-surface"
                      onClick={() => void markOneRead(r.id)}
                    >
                      {t("store_owner_notif_mark_read")}
                    </button>
                  ) : null}
                </div>
                </div>
                {!selectionMode ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    aria-label={t("notif_inbox_delete_aria")}
                    title={t("notif_inbox_delete_aria")}
                    onClick={() => setPendingDeleteIds([r.id])}
                    className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect text-sam-muted transition active:bg-sam-pressed-surface active:text-sam-danger hover:text-sam-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-sam-muted">
        <Link href={OwnerRoutes.notificationSettings(storeId)} className="text-signature underline">
          {t("store_owner_notif_settings_link")}
        </Link>
        {" · "}
        <Link href="/mypage/notifications" className="text-signature underline">
          {t("store_owner_notif_all_link")}
        </Link>
      </p>
      <NotificationDeleteConfirmDialog
        open={pendingDeleteIds != null}
        message={
          (pendingDeleteIds?.length ?? 0) > 1
            ? t("notif_center_delete_selected_confirm", { n: pendingDeleteIds?.length ?? 0 })
            : t("notif_inbox_delete_confirm")
        }
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={actionBusy}
        onCancel={() => setPendingDeleteIds(null)}
        onConfirm={() => {
          if (pendingDeleteIds) void runDelete(pendingDeleteIds);
        }}
      />
      {actionError ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
          style={{ bottom: "calc(24px + var(--safe-bottom, 0px))" }}
        >
          <p className="max-w-[24rem] rounded-ui-rect bg-sam-fg px-4 py-3 text-center text-[13px] font-medium text-sam-surface shadow-lg">
            {t("notif_inbox_error_failed")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
