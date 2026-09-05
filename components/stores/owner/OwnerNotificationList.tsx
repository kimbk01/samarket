"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  if (error === "login_required") {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        {t("store_owner_notif_login_to_view")}
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-ui-rect border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
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
            onClick={() => setTab((prev) => (prev === tabId ? prev : tabId))}
            className={`rounded-full px-3 py-1 sam-text-xxs font-semibold ${
              tab === tabId ? "bg-sam-ink text-white" : "bg-sam-surface text-sam-fg ring-1 ring-sam-border"
            }`}
          >
            {tabId === "all"
              ? t("store_owner_notif_tab_all")
              : t(GROUP_TAB_LABEL_KEY[tabId as Exclude<OwnerNotifTab, "all">])}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={markBusy || rows.every((r) => r.is_read)}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
          onClick={() => void markAllForStoreRead()}
        >
          {markBusy ? t("store_owner_notif_mark_all_busy") : t("store_owner_notif_mark_all_read")}
        </button>
      </div>
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
                className={`rounded-ui-rect border px-3 py-3 ${
                  !r.is_read ? "border-sam-border bg-signature/5" : "border-sam-border-soft bg-sam-surface"
                }`}
              >
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
                      className="text-xs text-sam-muted underline"
                      onClick={() => void markOneRead(r.id)}
                    >
                      {t("store_owner_notif_mark_read")}
                    </button>
                  ) : null}
                </div>
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
    </div>
  );
}
