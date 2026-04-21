"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  commerceMetaKindLabel,
  notificationTypeLabel,
} from "@/lib/notifications/notification-display-labels";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import { invalidateMeNotificationsListDedupedCache } from "@/lib/me/fetch-me-notifications-deduped";

type Row = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
  ref_id?: string | null;
};

function adminOrderHref(r: Row): string {
  const meta = r.meta as { order_id?: string } | undefined;
  const oid = (meta?.order_id ?? r.ref_id ?? "").trim();
  if (oid) return `/admin/store-orders?order_id=${encodeURIComponent(oid)}`;
  const u = r.link_url?.trim();
  if (u && u.startsWith("/")) return u;
  return "/admin/delivery-orders";
}

export function AdminNotificationList() {
  const { language } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/me/notifications", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; notifications?: Row[]; error?: string };
      if (res.status === 401) {
        setError("unauthorized");
        setRows([]);
        return;
      }
      if (!j?.ok) {
        setError(typeof j?.error === "string" ? j.error : "load_failed");
        setRows([]);
        return;
      }
      setRows((j.notifications ?? []) as Row[]);
      setError(null);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const onUpdated = () => void load(true);
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
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, NOTIFICATION_SYNC_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const broadcast = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  };

  const markRead = async (id: string) => {
    const res = await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (j?.ok) {
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
      invalidateMeNotificationsListDedupedCache();
      broadcast();
    }
  };

  const markAllRead = async () => {
    const res = await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all_read: true }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (j?.ok) {
      setRows((prev) => prev.map((x) => ({ ...x, is_read: true })));
      invalidateMeNotificationsListDedupedCache();
      broadcast();
    }
  };

  if (loading) {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }

  if (error === "unauthorized") {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        관리자로 로그인한 뒤 알림을 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-sm text-sam-muted">
          Supabase `notifications` 원장 기준 인앱 알림입니다. 주문·매장·시스템 알림이 포함될 수 있습니다.
        </p>
        {rows.some((r) => !r.is_read) ? (
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs text-sam-fg"
            onClick={() => void markAllRead()}
          >
            전체 읽음
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">
          알림이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const kind = (r.meta as { kind?: string } | undefined)?.kind;
            const kindLabel = commerceMetaKindLabel(kind, language);
            const typeLabel = notificationTypeLabel(r.notification_type, language);
            const href = adminOrderHref(r);
            return (
              <li
                key={r.id}
                className={`rounded-ui-rect border px-4 py-3 ${
                  !r.is_read ? "border-amber-200 bg-amber-50/50" : "border-sam-border-soft bg-sam-surface"
                }`}
              >
                <div className="flex flex-wrap justify-between gap-1 sam-text-xxs text-sam-muted">
                  <span>
                    {kindLabel ?? typeLabel}
                    {kindLabel ? <span className="text-sam-muted"> · {typeLabel}</span> : null}
                  </span>
                  <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-sam-fg">{r.title}</p>
                {r.body ? <p className="mt-0.5 sam-text-body-secondary text-sam-fg">{r.body}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={href}
                    className="text-xs font-semibold text-signature underline"
                    onClick={() => {
                      if (!r.is_read) void markRead(r.id);
                    }}
                  >
                    바로가기
                  </Link>
                  {!r.is_read ? (
                    <button
                      type="button"
                      className="text-xs text-sam-muted underline"
                      onClick={() => void markRead(r.id)}
                    >
                      읽음
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-sam-muted">
        <Link href="/admin/order-notifications/settings" className="text-signature underline">
          알림 설정
        </Link>
      </p>
    </div>
  );
}
