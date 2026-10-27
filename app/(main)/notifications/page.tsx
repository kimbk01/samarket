"use client";

import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MoreHorizontal, Settings } from "lucide-react";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";
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
  /**
   * ⋯ 메뉴 = 액션시트 (실기기 V1 FAIL 2026-10-27): 헤더 안 absolute 드롭다운은 `RegionBar` 의
   * `overflow-x-hidden` 에 잘려 보이지 않았다. 시트는 오버레이 루트에 그려져 Android 뒤로가기도 처리된다.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [selectionMode, setSelectionMode] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 선택 삭제 확인은 MyNotificationsView 선택 툴바가 소유 (U-02 — 확인창 1개) */
  const [confirm, setConfirm] = useState<"read_delete" | "all_delete" | null>(null);
  /** N-06 — 읽은 알림 삭제·전체 삭제 실패 표시 (목록 행동 실패 토스트와 같은 3초) */
  const [bulkErrorToast, setBulkErrorToast] = useState(false);
  useEffect(() => {
    if (!bulkErrorToast) return;
    const timer = setTimeout(() => setBulkErrorToast(false), 3000);
    return () => clearTimeout(timer);
  }, [bulkErrorToast]);
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
        if (!res.ok || !j?.ok) {
          setBulkErrorToast(true);
          return;
        }
        invalidateMeNotificationsListDedupedCache();
        broadcast();
        resyncBadgesAfterNotificationEventsRead("notification_opened");
      } catch {
        setBulkErrorToast(true);
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
          <div className="flex items-center">
            {selectionMode ? (
              <button
                type="button"
                disabled={busy}
                onClick={exitSelection}
                className="sam-header-action min-h-11 min-w-11 px-2 text-[14px] font-semibold text-sam-fg disabled:opacity-50"
              >
                {t("notif_center_cancel_selection")}
              </button>
            ) : (
              <>
                <Link
                  href="/mypage/section/settings/notifications"
                  className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-fg"
                  aria-label={t("notif_tier1_to_settings")}
                >
                  <Settings className="h-5 w-5" strokeWidth={2} aria-hidden />
                </Link>
                <button
                  type="button"
                  className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-sam-fg"
                  aria-label={t("notif_center_more_menu")}
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                >
                  <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </>
            )}
          </div>
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col py-3`}>
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
      <DibayActionSheet
        open={menuOpen}
        onClose={closeMenu}
        title={t("notif_center_more_menu")}
        cancelLabel={t("notif_inbox_delete_dialog_cancel")}
        items={[
          {
            key: "select",
            label: t("notif_center_select"),
            onClick: () => setSelectionMode(true),
          },
          {
            key: "read_delete",
            // U-05 — 삭제 범위(모든 분류) 부제
            label: (
              <span className="flex flex-col items-center leading-tight">
                <span>{t("notif_center_delete_read")}</span>
                <span className="mt-0.5 text-[11px] font-normal text-sam-meta">
                  {t("notif_center_delete_read_scope")}
                </span>
              </span>
            ),
            onClick: () => setConfirm("read_delete"),
          },
          {
            key: "all_delete",
            label: (
              <span className="flex flex-col items-center leading-tight">
                <span>{t("notif_center_delete_all")}</span>
                <span className="mt-0.5 text-[11px] font-normal text-sam-meta">
                  {t("notif_center_delete_all_scope")}
                </span>
              </span>
            ),
            danger: true,
            onClick: () => setConfirm("all_delete"),
          },
        ]}
      />
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
          void runBulkDelete(confirmRef.current === "all_delete" ? "all" : "read_only");
        }}
      />
      {bulkErrorToast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="notif-bulk-error-toast"
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4"
          style={{ bottom: "calc(76px + var(--safe-bottom, 0px))" }}
        >
          <p className="max-w-[24rem] rounded-ui-rect bg-sam-fg px-4 py-3 text-center text-[13px] font-medium text-sam-surface shadow-lg">
            {t("notif_inbox_error_failed")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
