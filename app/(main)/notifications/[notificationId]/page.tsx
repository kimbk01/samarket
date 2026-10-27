"use client";

import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { NotificationInboxCategoryIcon } from "@/components/notifications/NotificationInboxCategoryIcon";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { invalidateMeNotificationsListDedupedCache } from "@/lib/me/fetch-me-notifications-deduped";
import { fetchMeNotificationById } from "@/lib/me/fetch-me-notification-by-id";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import { activateNotificationDestination } from "@/lib/notifications/navigate-notification-destination";
import { prewarmInboxNotificationChatHref } from "@/lib/notifications/prewarm-inbox-notification-href";
import { resolveNotificationInboxVisual } from "@/lib/notifications/notification-inbox-visual";
import {
  classifyMemberNotificationDomain,
  memberNotificationDomainLabelKey,
  memberNotificationDomainRowFromInbox,
} from "@/lib/notifications/member-notification-domain";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { openDestination } from "@/lib/destination/open-destination";
import { NotificationContentUnavailableNotice } from "@/components/notifications/NotificationContentUnavailableNotice";

type DetailRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  is_read: boolean;
  link_url: string | null;
  notification_type: string;
  meta?: Record<string, unknown> | null;
  push_kind?: string | null;
  bell_presentation_type?: string | null;
  event_type?: string | null;
  campaign_type?: string | null;
  event_kind?: string | null;
};

/**
 * Gate 3 Step 8 — persistent announcement / notification detail.
 * INAPP-03: loads the row by id from `GET /api/me/notifications/:id` (viewer-scoped on the
 * server; works past the first list page). Missing / another member's id → standard notice.
 */
export default function NotificationDetailPage() {
  const { t, language } = useI18n();
  const router = useRouter();
  const params = useParams();
  const notificationId = String(params?.notificationId ?? "").trim();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const canonicalRedirectedRef = useRef<string | null>(null);

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
        const { status, json } = await fetchMeNotificationById(notificationId);
        if (cancelled) return;
        if (status === 401) {
          setError("login_required");
          setLoading(false);
          return;
        }
        const j = json as { ok?: boolean; notification?: DetailRow | null };
        const list = filterMemberNotificationAInboxRows(
          j?.ok && j.notification ? [j.notification] : []
        ) as DetailRow[];
        const found = list.find((r) => r.id === notificationId) ?? null;
        if (!found) {
          setError(status === 404 || j?.ok ? "not_found" : "load_failed");
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
            // List reflects the read immediately on Back (no 20s TTL stale row).
            invalidateMeNotificationsListDedupedCache();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
            }
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

  const ctaDestination = row
    ? resolveNotificationDestination({
        inboxRow: {
          id: row.id,
          notification_type: row.notification_type,
          link_url: row.link_url,
          meta: row.meta ?? null,
          push_kind: row.push_kind ?? null,
          bell_presentation_type: row.bell_presentation_type ?? null,
          event_type: row.event_type ?? null,
          campaign_type: row.campaign_type ?? null,
        },
        fallbackHref: defaultInboxFallbackHref(),
      })
    : null;

  const visual = useMemo(
    () =>
      row
        ? resolveNotificationInboxVisual({
            push_kind: row.push_kind,
            bell_presentation_type: row.bell_presentation_type,
            notification_type: row.notification_type,
            campaign_type: row.campaign_type,
            event_type: row.event_type,
            surfaceBadge: "",
          })
        : null,
    [row]
  );

  const categoryLabel = useMemo(() => {
    if (!row) return "";
    const domain = classifyMemberNotificationDomain(memberNotificationDomainRowFromInbox(row));
    if (domain) return t(memberNotificationDomainLabelKey(domain));
    return t("common_notifications");
  }, [row, t]);

  const whenLabel = useMemo(() => {
    if (!row) return "";
    return new Date(row.created_at).toLocaleString(language === "ko" ? "ko-KR" : "en-US", {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [language, row]);

  // Original destination exists → detail is not an intermediate stop.
  useEffect(() => {
    if (!row || ctaDestination?.kind !== "canonical") return;
    if (canonicalRedirectedRef.current === row.id) return;
    canonicalRedirectedRef.current = row.id;
    activateNotificationDestination({
      router,
      resolveInput: {
        inboxRow: {
          id: row.id,
          notification_type: row.notification_type,
          link_url: row.link_url,
          meta: row.meta ?? null,
          push_kind: row.push_kind ?? null,
          bell_presentation_type: row.bell_presentation_type ?? null,
          event_type: row.event_type ?? null,
          campaign_type: row.campaign_type ?? null,
        },
        fallbackHref: defaultInboxFallbackHref(),
      },
      onBeforeNavigate: (resolvedHref) => {
        prewarmInboxNotificationChatHref(router, resolvedHref);
      },
      // CTA-07: auto-forward replaces this intermediate entry — Back must not re-enter and re-forward.
      navigationMode: "replace",
    });
  }, [ctaDestination?.kind, row, router]);

  const onDelete = async () => {
    if (!row || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete_ids: [row.id] }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !j?.ok) return;
      invalidateMeNotificationsListDedupedCache();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
      }
      resyncBadgesAfterNotificationEventsRead("notification_opened");
      router.replace("/notifications");
    } finally {
      setDeleteBusy(false);
    }
  };

  const onConfirm = () => {
    router.push("/notifications");
  };

  // ADM-01: server-allowlisted external campaign link — opened outside the app shell.
  const externalUrl =
    typeof row?.meta?.external_url === "string" && row.meta.external_url.startsWith("https://")
      ? row.meta.external_url
      : null;
  // Scope B — one opener: external https → in-app browser, internal → router.
  const onOpenExternal = () => {
    if (externalUrl) openDestination(externalUrl, router);
  };
  /** INAPP-04 — origin content deleted / unresolvable (detail stays, notice explains why). */
  const originUnavailable = ctaDestination?.kind === "inbox_fallback";

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("notif_detail_title")}
        backHref="/notifications"
        hideCtaStrip
        rightSlot={
          row && ctaDestination?.kind !== "canonical" ? (
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => void onDelete()}
              className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-muted disabled:opacity-50"
              aria-label={t("notif_inbox_delete_aria")}
            >
              <Trash2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          ) : null
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-1 flex-col py-4`}>
          {loading ? (
            <p className="text-sm text-sam-muted">{t("common_loading")}</p>
          ) : error === "login_required" ? (
            <p className="text-sm text-sam-muted">{t("notif_inbox_login_required")}</p>
          ) : error === "not_found" ? (
            <div className="flex flex-col gap-3">
              <NotificationContentUnavailableNotice />
              <button
                type="button"
                onClick={() => router.replace("/notifications")}
                className="flex min-h-11 w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[14px] font-semibold text-sam-fg"
              >
                {t("notif_center_back_to_inbox")}
              </button>
            </div>
          ) : error || !row ? (
            <p className="text-sm text-sam-muted">{t("common_content_unavailable")}</p>
          ) : ctaDestination?.kind === "canonical" ? (
            <p className="text-sm text-sam-muted">{t("common_loading")}</p>
          ) : (
            <article className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                {visual ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${visual.wellClassName}`}
                  >
                    <NotificationInboxCategoryIcon kind={visual.kind} className="h-3.5 w-3.5" />
                    {categoryLabel}
                  </span>
                ) : null}
                <span className="text-[12px] text-sam-meta" suppressHydrationWarning>
                  {whenLabel}
                </span>
              </div>
              <h1 className="mt-4 text-[22px] font-bold leading-snug text-sam-fg">{row.title}</h1>
              <div className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-sam-fg">
                {row.body ?? ""}
              </div>
              {originUnavailable ? (
                <NotificationContentUnavailableNotice className="mt-5" />
              ) : null}
              <div className="mt-auto flex flex-col gap-2 pt-8 pb-[max(1rem,var(--safe-bottom))]">
                {externalUrl ? (
                  <button
                    type="button"
                    onClick={onOpenExternal}
                    className="flex min-h-12 w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[15px] font-semibold text-sam-fg transition active:scale-[0.99]"
                  >
                    {t("notif_detail_open_external_link")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onConfirm}
                  className="flex min-h-12 w-full items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[15px] font-semibold text-sam-on-primary transition active:scale-[0.99]"
                >
                  {t("notif_detail_confirm")}
                </button>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
