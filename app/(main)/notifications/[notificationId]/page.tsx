"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { fetchMeNotificationsListDeduped } from "@/lib/me/fetch-me-notifications-deduped";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";

type DetailRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  is_read: boolean;
  link_url: string | null;
  notification_type: string;
  meta?: Record<string, unknown> | null;
};

/**
 * Gate 3 Step 8 — persistent announcement / notification detail.
 * Recipient must match current member (list fetch is user-scoped).
 */
export default function NotificationDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const notificationId = String(params?.notificationId ?? "").trim();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!notificationId) {
        setError("not_found");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { status, json } = await fetchMeNotificationsListDeduped({
          force: true,
          excludeChatMessages: true,
          excludeOwnerStoreCommerce: true,
          limit: 100,
        });
        if (cancelled) return;
        if (status === 401) {
          setError("login_required");
          setLoading(false);
          return;
        }
        const j = json as { ok?: boolean; notifications?: DetailRow[] };
        const list = filterMemberNotificationAInboxRows(j.notifications ?? []) as DetailRow[];
        const found = list.find((r) => r.id === notificationId) ?? null;
        if (!found) {
          setError("not_found");
          setLoading(false);
          return;
        }
        setRow(found);
        if (!found.is_read) {
          const res = await fetch("/api/me/notifications", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [found.id] }),
          });
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
          if (body?.ok) {
            setRow((prev) => (prev ? { ...prev, is_read: true } : prev));
            resyncBadgesAfterNotificationEventsRead("notification_opened");
          }
        }
        setError(null);
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notificationId]);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("common_notifications")}
        backHref="/notifications"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto w-full max-w-lg px-4 py-4">
          {loading ? (
            <p className="text-sm text-sam-muted">{t("common_loading")}</p>
          ) : error === "login_required" ? (
            <p className="text-sm text-sam-muted">{t("notif_inbox_login_required")}</p>
          ) : error || !row ? (
            <p className="text-sm text-sam-muted">{t("common_content_unavailable")}</p>
          ) : (
            <article className="space-y-3">
              <h1 className="text-lg font-semibold text-sam-fg">{row.title}</h1>
              <p className="text-[12px] text-sam-muted">
                {new Date(row.created_at).toLocaleString()}
              </p>
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-sam-fg">
                {row.body ?? ""}
              </div>
              {row.link_url ? (
                <button
                  type="button"
                  className="mt-4 min-h-11 w-full rounded-ui-rect bg-sam-primary px-4 py-3 text-[14px] font-semibold text-white"
                  onClick={() => router.push(row.link_url!)}
                >
                  {t("notif_tier1_see_all")}
                </button>
              ) : null}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
