"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  commerceMetaKindLabel,
  notificationTypeLabel,
} from "@/lib/notifications/notification-display-labels";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import { fetchMeNotificationsListDeduped } from "@/lib/me/fetch-me-notifications-deduped";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import {
  prewarmChatRouteData,
  shouldWarmChatRoute,
} from "@/lib/chats/prewarm-chat-room-route";

/** 구매자 매장 주문 알림: 저장된 링크가 상세/채팅이어도 목록으로 통일 */
function resolveNotificationShortcutHref(r: Row): string | null {
  const u = r.link_url?.trim();
  if (!u) return null;
  if (r.notification_type !== "commerce") return u;
  if (isOwnerStoreCommerceNotificationRow(r)) return u;
  let path = u;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      path = new URL(u).pathname;
    } catch {
      return u;
    }
  }
  if (path === "/my/store-orders" || path.startsWith("/my/store-orders/")) {
    return "/my/store-orders";
  }
  return u;
}

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

export function MyNotificationsView() {
  const router = useRouter();
  const { language, t } = useI18n();
  const { goBusinessHubOrModal, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prewarmShortcutRoute = useCallback(
    (hrefRaw: string | null | undefined) => {
      const href = hrefRaw?.trim();
      if (!href || !shouldWarmChatRoute(href)) return;
      router.prefetch(href);
      prewarmChatRouteData(href);
    },
    [router]
  );

  const load = useCallback(async (silent = false, forceFetch = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const { status, json: raw } = await fetchMeNotificationsListDeduped({
        force: forceFetch,
      });
      const j = raw as { ok?: boolean; error?: string; notifications?: Row[] };
      if (status === 401) {
        setError("로그인이 필요합니다.");
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
      if (!silent) setLoading(false);
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
    setBusy(true);
    setError(null);
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
      broadcastNotificationsUpdated();
      await load(true, true);
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }

  if (error === "로그인이 필요합니다.") {
    return <p className="text-sm text-sam-muted">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {hubBlockedModal}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sam-text-helper text-sam-muted">
          채팅·거래·배달 주문 알림 등입니다. <strong>배달 입점 사장님용 새 주문 알림</strong>은{" "}
          <button
            type="button"
            onClick={() => goBusinessHubOrModal("/my/business")}
            className="font-medium text-signature underline"
          >
            내 매장 관리
          </button>
          헤더 종 아이콘과{" "}
          <button
            type="button"
            onClick={() => goBusinessHubOrModal("/my/business")}
            className="font-medium text-signature underline"
          >
            주문 관리
          </button>
          에서만 뱃지로 안내됩니다. 바로가기를 누르면 읽음 처리됩니다.
        </p>
        {rows.some((r) => !r.is_read) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void markAllRead()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg disabled:opacity-50"
          >
            {busy ? t("common_processing") : t("common_mark_all_read")}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">({error})</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">{t("common_notifications_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const typeLbl = notificationTypeLabel(r.notification_type, language);
            const kindLbl =
              r.notification_type === "commerce" ? commerceMetaKindLabel(r.meta?.kind, language) : null;
            const shortcutHref = resolveNotificationShortcutHref(r) ?? r.link_url ?? "";
            return (
              <li
                key={r.id}
                className={`rounded-ui-rect border px-3 py-3 shadow-sm ${
                  r.is_read ? "border-sam-border-soft bg-sam-surface" : "border-signature/25 bg-signature/5"
                }`}
              >
                <div className="flex flex-wrap justify-between gap-1 sam-text-xxs text-sam-meta">
                  <span>
                    {typeLbl}
                    {kindLbl ? (
                      <span className="text-sam-meta"> · {kindLbl}</span>
                    ) : null}
                  </span>
                  <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-1 sam-text-body font-semibold text-sam-fg">{r.title}</p>
                {r.body ? <p className="mt-1 sam-text-body-secondary text-sam-fg">{r.body}</p> : null}
                {r.link_url ? (
                  <Link
                    href={shortcutHref}
                    className="mt-2 inline-block sam-text-body-secondary text-signature underline"
                    onMouseEnter={() => prewarmShortcutRoute(shortcutHref)}
                    onTouchStart={() => prewarmShortcutRoute(shortcutHref)}
                    onClick={() => {
                      if (!r.is_read) void markIdsRead([r.id]);
                      prewarmShortcutRoute(shortcutHref);
                    }}
                  >
                    바로가기
                  </Link>
                ) : !r.is_read ? (
                  <button
                    type="button"
                    className="mt-2 sam-text-body-secondary text-signature underline"
                    onClick={() => void markIdsRead([r.id])}
                  >
                    읽음 처리
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
