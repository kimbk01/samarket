"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_INBOX_CHANGED_EVENT,
  type AdminNotificationDto,
} from "@/lib/admin/notifications/admin-notification-kinds";

type ListPayload = { ok?: boolean; items?: AdminNotificationDto[]; unread?: number; hasMore?: boolean; error?: string };

function emitInboxChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ADMIN_INBOX_CHANGED_EVENT));
}

/**
 * /admin/inbox — R13 ADMIN NOTIFICATION inbox (caller's own rows only).
 * Read ≠ resolved: opening or marking read never changes the linked work item.
 */
export function AdminInboxPageClient() {
  const { t, language } = useI18n();
  const [items, setItems] = useState<AdminNotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const qs = new URLSearchParams({ limit: "30" });
      if (before) qs.set("before", before);
      if (unreadOnly) qs.set("unread", "1");
      const res = await fetch(`/api/admin/inbox?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ListPayload;
      if (!res.ok || !json.ok) throw new Error(json.error ?? `http_${res.status}`);
      return json;
    },
    [unreadOnly]
  );

  const [delivery, setDelivery] = useState<{
    outboxDead?: number;
    outboxPending?: number;
    pushDead?: number;
    pushUnknown?: number;
    unavailable?: boolean;
  } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      void fetch("/api/admin/inbox?summary=1", { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .then((j: { delivery?: typeof delivery }) => setDelivery(j?.delivery ?? null))
        .catch(() => setDelivery(null));
      const json = await fetchPage(null);
      setItems(json.items ?? []);
      setUnread(json.unread ?? 0);
      setHasMore(Boolean(json.hasMore));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const json = await fetchPage(last.createdAt);
      setItems((prev) => [...prev, ...(json.items ?? []).filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(Boolean(json.hasMore));
      setUnread(json.unread ?? 0);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inbox/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(true);
        return;
      }
      emitInboxChanged();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const locale = language === "en" ? "en-US" : "ko-KR";

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="admin-inbox-page">
      <AdminPageHeader titleKey="admin_inbox_title" descriptionKey="admin_inbox_desc" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-sam-muted">
          <input
            id="admin-inbox-unread-only"
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          {t("admin_inbox_unread_only")}
        </label>
        <button
          type="button"
          className="sam-btn sam-btn--outline sam-btn--sm"
          disabled={busy || unread === 0}
          onClick={() => void markRead({ all: true })}
        >
          {t("admin_inbox_mark_all_read")} ({unread})
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {t("admin_inbox_load_error")}
        </p>
      ) : null}
      {delivery &&
      (delivery.unavailable || (delivery.outboxDead ?? 0) > 0 || (delivery.pushDead ?? 0) > 0) ? (
        <div
          className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="admin-inbox-delivery-failure"
        >
          {delivery.unavailable
            ? t("admin_inbox_delivery_health_unavailable")
            : `${t("admin_inbox_delivery_failed")} · outbox ${delivery.outboxDead ?? 0} · push ${delivery.pushDead ?? 0}`}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : items.length === 0 && !error ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-6 text-center text-sm text-sam-muted">
          {t("admin_inbox_empty")}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex flex-col gap-1 px-4 py-3 ${n.readAt ? "" : "bg-sam-app"}`}
              data-admin-inbox-item={n.id}
              data-read={n.readAt ? "1" : "0"}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm text-sam-fg ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
                <time className="shrink-0 text-xs tabular-nums text-sam-muted" dateTime={n.createdAt}>
                  {new Date(n.createdAt).toLocaleString(locale)}
                </time>
              </div>
              {n.body ? <p className="line-clamp-2 text-sm text-sam-muted">{n.body}</p> : null}
              <div className="flex gap-3 text-xs">
                {n.linkUrl ? (
                  <Link
                    href={n.linkUrl}
                    className="font-medium text-signature underline"
                    onClick={() => {
                      if (!n.readAt) void markRead({ ids: [n.id] });
                    }}
                  >
                    {t("admin_inbox_open_work")}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" disabled={busy} onClick={() => void loadMore()}>
          {t("admin_inbox_load_more")}
        </button>
      ) : null}
    </div>
  );
}
