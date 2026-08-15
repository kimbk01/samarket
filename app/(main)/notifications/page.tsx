"use client";

import Link from "next/link";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MoreHorizontal, Settings } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { invalidateMeNotificationsListDedupedCache } from "@/lib/me/fetch-me-notifications-deduped";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import {
  getNotificationBadgeCountServerSnapshot,
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";

type SelectionApi = {
  selectAll: () => void;
  clearSelection: () => void;
  markSelectedRead: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  selectedCount: number;
  totalCount: number;
};

/**
 * Notification Center — member N history.
 * Owner store ops live behind the right-side 「매장」 tab (not a sticky OwnerLite strip).
 */
export default function NotificationsCenterPage() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"read_delete" | "all_delete" | "selected_delete" | null>(
    null
  );
  const [selectedCount, setSelectedCount] = useState(0);
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const markAllRef = useRef<(() => Promise<void>) | null>(null);
  const selectionApiRef = useRef<SelectionApi | null>(null);

  const badgeSnap = useSyncExternalStore(
    subscribeNotificationBadgeCount,
    getNotificationBadgeCountSnapshot,
    getNotificationBadgeCountServerSnapshot
  );
  const headerUnread = useMemo(() => {
    const n = Math.max(0, Math.floor(Number(badgeSnap?.total) || 0));
    return n;
  }, [badgeSnap?.total]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const broadcast = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    }
  }, []);

  const exitSelection = useCallback(() => {
    selectionApiRef.current?.clearSelection();
    setSelectionMode(false);
    setSelectedCount(0);
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

  const onRegisterSelectionApi = useCallback((api: SelectionApi | null) => {
    selectionApiRef.current = api;
    setSelectedCount(api?.selectedCount ?? 0);
  }, []);

  const headerTitle = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{t("common_notifications")}</span>
      {headerUnread > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums"
          aria-label={t("notif_inbox_unread_n", { n: headerUnread })}
        >
          {headerUnread > 99 ? "99+" : headerUnread}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={headerTitle}
        backHref="/"
        hideCtaStrip
        rightSlot={
          <div className="flex items-center gap-0.5 pr-[max(0.25rem,env(safe-area-inset-right))]">
            {selectionMode ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={exitSelection}
                  className="sam-header-action min-h-11 min-w-11 px-2 text-[13px] font-semibold text-sam-fg disabled:opacity-50"
                  aria-label={t("notif_center_cancel_selection")}
                >
                  {t("notif_center_cancel_selection")}
                </button>
                <button
                  type="button"
                  disabled={busy || selectedCount === 0}
                  onClick={() => setConfirm("selected_delete")}
                  className="sam-header-action min-h-11 min-w-11 px-2 text-[13px] font-semibold text-red-700 disabled:opacity-50"
                  aria-label={t("notif_center_delete_selected")}
                >
                  {t("notif_center_delete_selected")}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/mypage/section/settings/notifications"
                  className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-fg"
                  aria-label={t("notif_tier1_to_settings")}
                >
                  <Settings className="h-5 w-5" strokeWidth={2} aria-hidden />
                </Link>
                <div className="relative">
                  <button
                    type="button"
                    className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-fg"
                    aria-label={t("notif_center_more_menu")}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 z-40 mt-1 min-w-[11rem] rounded-2xl border border-sam-border bg-sam-surface py-1 shadow-md"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2.5 text-left text-[13px] text-sam-fg hover:bg-sam-surface-muted"
                        onClick={() => {
                          setMenuOpen(false);
                          setSelectionMode(true);
                        }}
                      >
                        {t("notif_center_select")}
                      </button>
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
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto flex w-full max-w-lg min-w-0 flex-col px-3 py-3 sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
          <section
            id="notification-inbox"
            className="min-w-0 scroll-mt-4"
            aria-label={t("common_notifications")}
          >
            <Suspense fallback={<p className="text-sm text-sam-muted">{t("common_loading")}</p>}>
              <MyNotificationsView
                variant="notification_center"
                selectionMode={selectionMode}
                onSelectionModeChange={(next) => {
                  setSelectionMode(next);
                  if (!next) setSelectedCount(0);
                }}
                registerSelectionApi={onRegisterSelectionApi}
                registerMarkAll={(fn) => {
                  markAllRef.current = fn;
                }}
              />
            </Suspense>
          </section>
        </div>
      </div>
      <NotificationDeleteConfirmDialog
        open={confirm != null}
        message={
          confirm === "all_delete"
            ? t("notif_center_delete_all_confirm")
            : confirm === "selected_delete"
              ? t("notif_center_delete_selected_confirm")
              : t("notif_center_delete_read_confirm")
        }
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        confirmLabel={t("common_delete")}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirmRef.current === "selected_delete") {
            void (async () => {
              setBusy(true);
              try {
                await selectionApiRef.current?.deleteSelected();
                exitSelection();
              } finally {
                setBusy(false);
                setConfirm(null);
              }
            })();
            return;
          }
          const mode = confirmRef.current === "all_delete" ? "all" : "read_only";
          void runBulkDelete(mode);
        }}
      />
    </div>
  );
}
