"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { invalidateMeNotificationsListDedupedCache } from "@/lib/me/fetch-me-notifications-deduped";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";

/**
 * Gate 3 Step 8 — Member Notification Center (canonical).
 * Route: /notifications · authority = Member Notification A only.
 */
export default function NotificationsCenterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"read_delete" | "all_delete" | null>(null);
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const markAllRef = useRef<(() => Promise<void>) | null>(null);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const broadcast = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  const runBulkDelete = useCallback(
    async (mode: "read_only" | "all") => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/me/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "all"
              ? { delete_all_member_a: true }
              : { delete_read_member_a: true }
          ),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !j?.ok) return;
        invalidateMeNotificationsListDedupedCache();
        broadcast();
        resyncBadgesAfterNotificationEventsRead("notification_opened");
      } finally {
        setBusy(false);
        setConfirm(null);
        setMenuOpen(false);
      }
    },
    [broadcast, busy]
  );

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("common_notifications")}
        subtitle={t("tier1_notifications_subtitle")}
        backHref="/"
        hideCtaStrip
        rightSlot={
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void markAllRef.current?.()}
              className="sam-header-action min-h-11 min-w-11 px-2 text-[13px] font-medium text-sam-fg disabled:opacity-50"
              aria-label={t("notif_tier1_mark_read")}
            >
              {t("notif_tier1_mark_read")}
            </button>
            <div className="relative">
              <button
                type="button"
                className="sam-header-action flex h-11 w-11 items-center justify-center text-sam-fg"
                aria-label={t("notif_center_more_menu")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span aria-hidden className="text-lg leading-none">
                  ⋮
                </span>
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1 min-w-[11rem] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2.5 text-left text-[13px] text-sam-fg hover:bg-sam-surface-muted"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirm("read_delete");
                    }}
                  >
                    {t("notif_center_delete_read")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2.5 text-left text-[13px] text-sam-fg hover:bg-sam-surface-muted"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirm("all_delete");
                    }}
                  >
                    {t("notif_center_delete_all")}
                  </button>
                  <Link
                    href="/mypage/section/settings/notifications"
                    role="menuitem"
                    className="block w-full px-3 py-2.5 text-left text-[13px] text-sam-fg hover:bg-sam-surface-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("notifications_settings_title")}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto flex w-full max-w-lg min-w-0 flex-col px-3 py-4 md:max-w-md lg:max-w-[420px]">
          <section
            id="notification-inbox"
            className="min-w-0 scroll-mt-4"
            aria-label={t("common_notifications")}
          >
            <MyNotificationsView
              variant="notification_center"
              registerMarkAll={(fn) => {
                markAllRef.current = fn;
              }}
              onOpenDetail={(id) => {
                router.push(`/notifications/${encodeURIComponent(id)}`);
              }}
            />
          </section>
        </div>
      </div>
      <NotificationDeleteConfirmDialog
        open={confirm != null}
        message={
          confirm === "all_delete"
            ? t("notif_center_delete_all_confirm")
            : t("notif_center_delete_read_confirm")
        }
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const mode = confirmRef.current === "all_delete" ? "all" : "read_only";
          void runBulkDelete(mode);
        }}
      />
    </div>
  );
}
