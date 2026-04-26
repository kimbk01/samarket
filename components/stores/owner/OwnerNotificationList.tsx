"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
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

const GROUPS: { label: string; match: (r: Row) => boolean }[] = [
  { label: "신규 주문", match: (r) => (r.meta as { kind?: string } | undefined)?.kind === "store_order_created" },
  {
    label: "취소·결제",
    match: (r) =>
      ["store_order_buyer_cancelled", "store_order_payment_completed", "store_order_payment_failed"].includes(
        String((r.meta as { kind?: string } | undefined)?.kind)
      ),
  },
  {
    label: "환불",
    match: (r) =>
      ["store_order_refund_requested", "store_order_refund_approved"].includes(
        String((r.meta as { kind?: string } | undefined)?.kind)
      ),
  },
];

export function OwnerNotificationList({ slug, storeId }: { slug: string; storeId: string }) {
  const { language } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");
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
    const g = GROUPS.find((x) => x.label === tab);
    if (!g) return rows;
    return rows.filter((r) => g.match(r));
  }, [rows, tab]);

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
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }

  if (error === "login_required") {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        로그인한 뒤 알림을 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {["all", ...GROUPS.map((g) => g.label)].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab((prev) => (prev === t ? prev : t))}
            className={`rounded-full px-3 py-1 sam-text-xxs font-semibold ${
              tab === t ? "bg-sam-ink text-white" : "bg-sam-surface text-sam-fg ring-1 ring-sam-border"
            }`}
          >
            {t === "all" ? "전체" : t}
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
          {markBusy ? "처리 중…" : "이 매장 알림 모두 읽음"}
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-sm text-sam-muted ring-1 ring-sam-border-soft">
          알림이 없어요.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const kind = (r.meta as { kind?: string } | undefined)?.kind;
            const kindLabel = commerceMetaKindLabel(kind, language);
            const typeLabel = notificationTypeLabel(r.notification_type, language);
            const orderId = String((r.meta as { order_id?: string } | undefined)?.order_id ?? "").trim();
            const href =
              orderId.length > 0
                ? buildStoreOrdersHref({ storeId, orderId })
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
                {r.body ? <p className="mt-0.5 sam-text-body-secondary text-sam-fg">{r.body}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={href}
                    className="text-xs font-medium text-signature underline"
                    onClick={() => {
                      if (!r.is_read) void markOneRead(r.id);
                    }}
                  >
                    주문 보기
                  </Link>
                  {!r.is_read ? (
                    <button
                      type="button"
                      className="text-xs text-sam-muted underline"
                      onClick={() => void markOneRead(r.id)}
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
        <Link href={`/stores/${encodeURIComponent(slug)}/owner/notification-settings`} className="text-signature underline">
          알림 설정
        </Link>
        {" · "}
        <Link href="/mypage/notifications" className="text-signature underline">
          전체 알림
        </Link>
      </p>
    </div>
  );
}
