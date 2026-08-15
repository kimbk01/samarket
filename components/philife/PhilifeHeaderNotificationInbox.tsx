"use client";



import Link from "next/link";

import { useRouter, usePathname } from "next/navigation";

import {

  useCallback,

  useEffect,

  useId,

  useMemo,

  useRef,

  useState,

  useSyncExternalStore,

  type CSSProperties,

  type ReactNode,

} from "react";

import { createPortal } from "react-dom";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { getCurrentUserIdForDb, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";

import { InboxGroupCardList } from "@/components/notifications/InboxGroupCardList";


import {

  fetchMeNotificationSettingsSnapshot,

  invalidateMeNotificationSettingsGetFlight,

} from "@/lib/me/fetch-me-notification-settings-client";

import {
  scheduleNotificationSettingsSnapshotDeferred,
  scheduleStartupApiDeferred,
} from "@/lib/http/startup-api-scheduler";

import {

  fetchMeNotificationsListDeduped,

  invalidateMeNotificationsListDedupedCache,

} from "@/lib/me/fetch-me-notifications-deduped";

import {

  dispatchTier1HeaderOverlayClose,

  dispatchTier1HeaderOverlayOpen,

  TIER1_HEADER_OVERLAY_CLOSE,

} from "@/lib/layout/tier1-header-overlay-events";

import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";

import { prewarmInboxNotificationChatHref } from "@/lib/notifications/prewarm-inbox-notification-href";
import {
  activateNotificationDestination,
  pushNotificationDestination,
} from "@/lib/notifications/navigate-notification-destination";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { suppressCmRoomEntryNotificationSound } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";

import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";

import { resolveTier1HeaderBellBadgeTotal } from "@/lib/notifications/tier1-header-inbox-sync";

import {
  resolveTier1BellMarkAllReadBody,
  resolveTier1BellModalListFetchOpts,
  resolveTier1BellSurfaceFromPathname,
  type Tier1BellBadgeSurface,
} from "@/lib/notifications/resolve-tier1-bell-surface";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";

import {
  getNotificationBadgeCountSnapshot,
  getNotificationBadgeCountServerSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";
import {
  hasOwnerBellOperationRows,
  OwnerBellOperationSummary,
} from "@/components/notifications/OwnerBellOperationSummary";
import { NotificationInboxEmptyState } from "@/components/notifications/NotificationInboxEmptyState";
import { useOwnerHubBadgeBreakdownWhenEnabled } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";

export type { Tier1BellBadgeSurface };

import {

  buildInboxGroupItems,

  type InboxGroupItem,

} from "@/lib/notifications/group-inbox-by-thread";

import { countUnread } from "@/lib/notifications/aggregate-inbox-summaries";

import { unlockNotificationSoundAudio } from "@/lib/notifications/notification-sound-unlock";

import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

import {

  computeTier1NotificationInboxPopupLayout,

  TIER1_NOTIFICATION_INBOX_MOTION_MS,

  type Tier1NotificationInboxPopupLayout,

} from "@/lib/ui/tier1-notification-inbox-motion";

import {
  TIER1_HEADER_OVERLAY_BACKDROP_CLASS,
  TIER1_HEADER_OVERLAY_SHELL_CLASS,
  tier1HeaderOverlayBackdropStateClass,
} from "@/lib/ui/tier1-header-overlay-backdrop";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS } from "@/lib/ui/tier1-header-icon";

import { Tier1HeaderBellGlyph, Tier1HeaderBellMutedGlyph } from "@/lib/ui/tier1-header-glyphs";

import {

  STORES_HOME_HEADER_ICON_BTN_CLASS,

  STORES_HOME_HEADER_NOTIF_BADGE_CLASS,

} from "@/lib/design/stores-home-header-chrome";



type Row = {

  id: string;

  notification_type: string;

  title: string;

  body: string | null;

  link_url: string | null;

  is_read: boolean;

  created_at: string;

  meta?: Record<string, unknown> | null;

  domain?: string | null;

  push_kind?: string | null;

  bell_presentation_type?: import("@/lib/notifications/inbox-events-merge").BellPresentationType | null;

};



function BellGlyph({ muted }: { muted?: boolean }) {

  return muted ? <Tier1HeaderBellMutedGlyph /> : <Tier1HeaderBellGlyph />;

}



function CloseIcon({ className }: { className?: string }) {

  return (

    <svg className={className ?? "h-5 w-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>

      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />

    </svg>

  );

}



function SettingsGearIcon() {

  return (

    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>

      <path

        strokeLinecap="round"

        strokeLinejoin="round"

        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"

      />

      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />

    </svg>

  );

}



/**

 * `/philife`·`/stores` 1단 우측 종 — 벨 기준 팝업(좌하 펼침) + 배경 딤 + 즉시 목록

 */


export function PhilifeHeaderNotificationInbox({

  tone = "default",

  deferInboxListPrefetch = false,

  triggerClassName,

  unreadBadgeClassName,

  surface: surfaceProp,

  storeId,

  pinnedSections,

  supplementalUnreadCount = 0,

}: {

  /** 녹색 배달 홈 헤더 — 흰 아이콘·delivery 뱃지 */

  tone?: "default" | "onPrimary";

  /** `/stores` cold — 목록 prefetch 는 패널 open 시. badge store TTL 재사용 */

  deferInboxListPrefetch?: boolean;

  /** 지정 시 tone 기본 버튼 클래스 대신 사용(매장 히어로 글래스 등) */

  triggerClassName?: string;

  /** 지정 시 tone 기본 unread 뱃지 클래스 대신 사용 */

  unreadBadgeClassName?: string;

  /** 미지정 시 pathname 자동 — notification_targets surface */

  surface?: Tier1BellBadgeSurface;

  /** owner_commerce_inbox surface용 매장 id */

  storeId?: string | null;

  /** @deprecated Bell sheet is single-layer; pinned nested cards removed. Kept for call-site compat. */

  pinnedSections?: ReactNode;

  /** surface badge store 외 추가 미확인 건(메신저 주요 알림 등) */

  supplementalUnreadCount?: number;

}) {

  const pathname = usePathname();

  const resolvedSurface = surfaceProp ?? resolveTier1BellSurfaceFromPathname(pathname);

  /** Modal list = Member A all unread (matches Header badge). Never pathname pushKind filter. */
  const listFetchOpts = useMemo(() => resolveTier1BellModalListFetchOpts(), []);

  const router = useRouter();

  const { t, language } = useI18n();

  const panelId = useId();

  const triggerRef = useRef<HTMLButtonElement>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const enterGenRef = useRef(0);

  const [open, setOpen] = useState(false);

  const [visible, setVisible] = useState(false);

  const [entered, setEntered] = useState(false);

  const [layout, setLayout] = useState<Tier1NotificationInboxPopupLayout | null>(null);

  const [domReady, setDomReady] = useState(false);

  const [loading, setLoading] = useState(false);

  const [listSynced, setListSynced] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);

  const [markBusy, setMarkBusy] = useState(false);

  const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<InboxGroupItem | null>(null);

  const pendingDeleteRef = useRef<InboxGroupItem | null>(null);

  useEffect(() => {

    pendingDeleteRef.current = pendingDelete;

  }, [pendingDelete]);

  const [soundOn, setSoundOn] = useState(true);

  const [soundLoaded, setSoundLoaded] = useState(false);

  const grouped = useMemo(
    () => buildInboxGroupItems(rows, language, null),
    [rows, language]
  );

  /** Bell sheet: unread-only quick inbox — full history lives on /notifications. */
  const unreadPreviewItems = useMemo(
    () => grouped.filter((item) => item.unreadCount > 0),
    [grouped]
  );

  const ownerStore = useOwnerLitePreferredStoreRow();
  const ownerHub = useOwnerHubBadgeBreakdownWhenEnabled(ownerStore != null);
  const hasOPreview = hasOwnerBellOperationRows({
    hasOwnerStore: ownerStore != null,
    orderAttention: ownerHub.orderAttention,
    inquiryAttention: ownerHub.inquiryAttention,
  });

  const hasNPreview = unreadPreviewItems.length > 0;

  const rowUnread = useMemo(() => countUnread(rows), [rows]);

  const badgeCountSnap = useSyncExternalStore(
    subscribeNotificationBadgeCount,
    getNotificationBadgeCountSnapshot,
    getNotificationBadgeCountServerSnapshot
  );

  const totalUnread = useMemo(
    () =>
      resolveTier1HeaderBellBadgeTotal({
        surface: resolvedSurface,
        badgeCountTotal: badgeCountSnap?.total,
        rowUnread,
        listSynced,
        open,
        loading,
        supplementalUnreadCount,
      }),
    [
      badgeCountSnap?.total,
      listSynced,
      loading,
      open,
      resolvedSurface,
      rowUnread,
      supplementalUnreadCount,
    ]
  );

  const showListLoading = loading && rows.length === 0;



  useEffect(() => {

    setDomReady(true);

  }, []);



  const updateLayout = useCallback(() => {

    const rect = triggerRef.current?.getBoundingClientRect();

    if (!rect) return;

    setLayout(computeTier1NotificationInboxPopupLayout(rect));

  }, []);



  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  /** Kill overlay sync — see-all / row nav must not wait 240ms close motion. */
  const closePanelImmediate = useCallback(() => {
    enterGenRef.current += 1;
    setOpen(false);
    setEntered(false);
    setVisible(false);
  }, []);

  const openNotificationsCenter = useCallback(() => {
    closePanelImmediate();
    pushNotificationDestination(router, "/notifications");
  }, [closePanelImmediate, router]);




  useEffect(() => {

    if (open) {

      dispatchTier1HeaderOverlayOpen();

    } else {

      dispatchTier1HeaderOverlayClose();

    }

  }, [open]);



  useEffect(() => {

    const onExternalClose = () => closePanel();

    window.addEventListener(TIER1_HEADER_OVERLAY_CLOSE, onExternalClose);

    return () => window.removeEventListener(TIER1_HEADER_OVERLAY_CLOSE, onExternalClose);

  }, [closePanel]);



  useEffect(() => {

    if (!open) {

      enterGenRef.current += 1;

      setEntered(false);

      const timer = window.setTimeout(() => {

        setVisible(false);

      }, TIER1_NOTIFICATION_INBOX_MOTION_MS);

      return () => window.clearTimeout(timer);

    }



    const gen = ++enterGenRef.current;

    setVisible(true);

    updateLayout();

    let innerId = 0;

    const outerId = window.requestAnimationFrame(() => {

      innerId = window.requestAnimationFrame(() => {

        if (enterGenRef.current === gen) setEntered(true);

      });

    });

    const fallback = window.setTimeout(() => {

      if (enterGenRef.current === gen) setEntered(true);

    }, 48);

    return () => {

      window.cancelAnimationFrame(outerId);

      if (innerId) window.cancelAnimationFrame(innerId);

      window.clearTimeout(fallback);

    };

  }, [open, updateLayout]);



  const loadSound = useCallback(async () => {

    try {

      const snap = await fetchMeNotificationSettingsSnapshot();

      if (snap?.ok && snap.settings) {

        setSoundOn(snap.settings.sound_enabled !== false);

      }

    } catch {

      /* ignore */

    } finally {

      setSoundLoaded(true);

    }

  }, []);



  const loadInbox = useCallback(async (force: boolean, opts?: { silent?: boolean }) => {

    const silent = opts?.silent === true;

    if (!silent) setLoading(true);

    try {

      if (force) {

        invalidateMeNotificationsListDedupedCache();

      }

      const { status, json: raw } = await fetchMeNotificationsListDeduped({
        force,
        excludeChatMessages: listFetchOpts.excludeChatMessages,
        excludeOwnerStoreCommerce: listFetchOpts.excludeOwnerStoreCommerce,
        pushKind: listFetchOpts.pushKind,
        ownerStoreId: listFetchOpts.ownerStoreId,
        // No explicit limit — server Member A path uses fetchUpper≈200 (better than page cap 100).
      });

      const j = raw as { ok?: boolean; notifications?: Row[] };

      if (status === 401) {

        setRows([]);

        setListSynced(false);

        return;

      }

      if (!j?.ok) {

        return;

      }

      const fetched = (j.notifications ?? []) as Row[];
      // Header Bell Modal = A_member only (always), matches badge equation consumers.
      const nextRows = filterMemberNotificationAInboxRows(fetched) as Row[];

      setRows(nextRows);

      setListSynced(true);

    } catch {

      /* 목록 실패 시 기존 store 배지 유지 */

    } finally {

      if (!silent) setLoading(false);

    }

  }, [listFetchOpts]);



  useEffect(() => {
    const cancel = scheduleNotificationSettingsSnapshotDeferred(
      () => {
        void loadSound();
      },
      { source: "notification-settings-philife-inbox" }
    );
    return cancel;
  }, [loadSound]);



  useEffect(() => {

    if (deferInboxListPrefetch) return;

    const cancel = scheduleStartupApiDeferred("philife-tier1-inbox-prefetch", () => {
      void (async () => {
        const uid = getSyncViewerUserIdForClient() ?? (await getCurrentUserIdForDb());
        if (!uid) return;
        void loadInbox(false, { silent: true });
      })();
    }, { delayMs: 0 });

    return cancel;

  }, [deferInboxListPrefetch, loadInbox]);



  // Modal list is Member A always — pathname surface must NOT wipe rows without reload.
  // (Previously: surface change → setRows([]) → empty sheet with only Owner ops.)

  useEffect(() => {

    if (typeof window === "undefined") return;

    const onCustom = () => {

      invalidateMeNotificationSettingsGetFlight();

      void loadSound();

    };

    const onInbox = () => {

      void loadInbox(true, { silent: true });

    };

    window.addEventListener("kasama:user-notification-settings-changed", onCustom);

    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);

    return () => {

      window.removeEventListener("kasama:user-notification-settings-changed", onCustom);

      window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);

    };

  }, [loadInbox, loadSound]);



  useEffect(() => {

    if (!visible) {

      document.body.classList.remove("overflow-hidden");

      setPendingDelete(null);

      return;

    }

    document.body.classList.add("overflow-hidden");

    return () => document.body.classList.remove("overflow-hidden");

  }, [visible]);



  useEffect(() => {

    if (!visible) return;

    updateLayout();

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "Escape") closePanel();

    };

    document.addEventListener("keydown", onKey);

    window.addEventListener("resize", updateLayout);

    window.addEventListener("scroll", updateLayout, true);

    return () => {

      document.removeEventListener("keydown", onKey);

      window.removeEventListener("resize", updateLayout);

      window.removeEventListener("scroll", updateLayout, true);

    };

  }, [visible, closePanel, updateLayout]);



  useEffect(() => {

    if (!open) return;

    void loadInbox(true, { silent: listSynced });

  }, [open, listSynced, loadInbox]);



  const markIdsRead = useCallback(async (ids: string[]) => {

    if (ids.length === 0) return;

    // Optimistic: row leaves unread queue immediately (badge resync follows server).
    setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));

    const res = await fetch("/api/me/notifications", {

      method: "PATCH",

      credentials: "include",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ ids }),

    });

    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };

    if (res.ok && j?.ok) {

      if (typeof window !== "undefined") {

        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));

      }

      resyncBadgesAfterNotificationEventsRead("notification_opened");

    } else {
      // Revert optimistic read on failure — do not invent destination fallback.
      setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: false } : x)));
    }

  }, []);



  const onActivate = (item: InboxGroupItem) => {
    activateNotificationDestination({
      router,
      resolveInput: {
        inboxRow: {
          id: item.notification_id,
          notification_type: item.notification_type,
          link_url: item.href,
          meta: item.meta,
          push_kind: item.push_kind ?? null,
          bell_presentation_type: item.bell_presentation_type ?? null,
          event_type: item.event_type ?? null,
          campaign_type: item.campaign_type ?? null,
        },
        fallbackHref: defaultInboxFallbackHref(),
      },
      onBeforeNavigate: (resolvedHref) => {
        suppressCmRoomEntryNotificationSound(resolvedHref);
        closePanelImmediate();
        prewarmInboxNotificationChatHref(router, resolvedHref);
      },
      unreadIds: item.unreadCount > 0 ? item.ids : [],
      markRead: markIdsRead,
    });
    invalidateMeNotificationsListDedupedCache();
  };



  const onItemWarm = (item: InboxGroupItem) => {

    prewarmInboxNotificationChatHref(router, item.href);

  };



  const markAllRead = useCallback(async () => {
    if (markBusy || totalUnread === 0) return;
    setMarkBusy(true);
    const previousRows = rows;
    // Immediate modal UI — unread queue clears now; badge uses existing resync after ACK.
    setRows((prev) => prev.map((x) => ({ ...x, is_read: true })));
    invalidateMeNotificationsListDedupedCache();
    try {
      const markBody = resolveTier1BellMarkAllReadBody("tier1_inbox_bell", []);
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(markBody),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        }
        resyncBadgesAfterNotificationEventsRead("mark_all_read_cross_tab");
        void loadInbox(true, { silent: true });
      } else {
        setRows(previousRows);
        await loadInbox(true, { silent: true });
      }
    } catch {
      setRows(previousRows);
      await loadInbox(true, { silent: true });
    } finally {
      setMarkBusy(false);
    }
  }, [loadInbox, markBusy, rows, totalUnread]);



  const requestDeleteGroup = useCallback((item: InboxGroupItem) => {

    setPendingDelete(item);

  }, []);



  const runDeleteGroup = useCallback(async (item: InboxGroupItem) => {

    setDeleteBusyKey(item.key);

    try {

      const res = await fetch("/api/me/notifications", {

        method: "PATCH",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ delete_ids: item.ids }),

      });

      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };

      if (res.ok && j?.ok) {

        setRows((prev) => {

          return prev.filter((r) => !item.ids.includes(r.id));

        });

        invalidateMeNotificationsListDedupedCache();

        void loadInbox(true, { silent: true });

        resyncBadgesAfterNotificationEventsRead("notification_opened");

        if (typeof window !== "undefined") {

          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));

        }

      }

    } finally {

      setDeleteBusyKey(null);

      setPendingDelete(null);

    }

  }, [loadInbox]);



  const pendingDeleteMessage = useMemo(() => {

    if (!pendingDelete) return "";

    return pendingDelete.ids.length > 1

      ? t("notif_inbox_delete_group_confirm", { n: pendingDelete.ids.length })

      : t("notif_inbox_delete_confirm");

  }, [pendingDelete, t]);



  const popupMotionClass = entered

    ? "tier1-notification-inbox-popup--open"

    : "tier1-notification-inbox-popup--closed";

  const backdropMotionClass = tier1HeaderOverlayBackdropStateClass(entered);



  const panelStyle = useMemo((): CSSProperties | undefined => {
    if (!layout) return undefined;
    return {
      top: layout.top,
      left: layout.left,
      width: layout.width,
      height: layout.height,
      maxHeight: layout.height,
      transformOrigin: "top right",
    };
  }, [layout]);

  const closeBtnClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-muted/15 active:bg-sam-muted/20";

  const headerIconBtnClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-muted/15 active:bg-sam-muted/20";

  const panel =
    !domReady || !visible || !layout || !panelStyle
      ? null
      : createPortal(

          <div className={TIER1_HEADER_OVERLAY_SHELL_CLASS} role="presentation">

            <button

              type="button"

              className={`${TIER1_HEADER_OVERLAY_BACKDROP_CLASS} ${backdropMotionClass}`}

              aria-label={t("common_close")}

              onClick={closePanel}

            />

            <div

              ref={panelRef}

              id={panelId}

              style={panelStyle}

              className={`tier1-notification-inbox-popup fixed z-[1] flex min-h-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border/90 bg-sam-surface shadow-[0_14px_36px_rgba(0,0,0,0.16)] ${popupMotionClass}`}

              role="dialog"

              aria-modal="true"

              aria-labelledby="philife-inbox-title"

            >

              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sam-border/80 bg-sam-surface-muted px-3 py-2.5">

                <div className="flex min-w-0 flex-1 items-center gap-2">

                  <h2 id="philife-inbox-title" className="min-w-0 truncate text-[16px] font-bold leading-none text-sam-fg">

                    {t("notif_tier1_sheet_title")}

                  </h2>

                  {totalUnread > 0 ? (

                    <span className="rounded-full bg-sam-danger px-2 py-0.5 sam-text-xxs font-semibold leading-none text-white">

                      {totalUnread}

                    </span>

                  ) : null}

                </div>

                <div className="flex shrink-0 items-center gap-0.5">

                  <Link

                    href="/mypage/section/settings/notifications"

                    onClick={closePanel}

                    className={headerIconBtnClass}

                    aria-label={t("notif_tier1_to_settings")}

                  >

                    <SettingsGearIcon />

                  </Link>

                  <button

                    type="button"

                    onClick={closePanel}

                    className={closeBtnClass}

                    aria-label={t("common_close")}

                  >

                    <CloseIcon />

                  </button>

                </div>

              </div>



              <div className={`flex min-h-0 flex-1 flex-col bg-sam-surface ${APP_MAIN_GUTTER_X_CLASS}`}>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
                {showListLoading ? (
                  <p className="px-2 py-2 sam-text-helper text-sam-muted">{t("common_loading")}</p>
                ) : (
                  <>
                    {hasNPreview ? (
                      <InboxGroupCardList
                        items={unreadPreviewItems}
                        summaryOnly
                        showSequenceIndex
                        emptyLabel={t("notif_tier1_empty")}
                        onItemWarm={onItemWarm}
                        onActivate={(item) => onActivate(item)}
                      />
                    ) : totalUnread > 0 ? (
                      <p className="px-2 py-6 text-center text-[13px] leading-snug text-sam-muted">
                        {t("notif_tier1_empty_with_digit_hint")}
                      </p>
                    ) : (
                      <NotificationInboxEmptyState kind="all_read" />
                    )}
                    {hasOPreview ? (
                      <OwnerBellOperationSummary
                        onNavigate={closePanel}
                        compact
                        className={hasNPreview ? "mt-2" : "mt-1"}
                      />
                    ) : null}
                  </>
                )}
                </div>
              </div>



              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-sam-border/50 px-3 py-2.5">

                {!showListLoading && (rows.length > 0 || totalUnread > 0) ? (

                  <button

                    type="button"

                    disabled={markBusy || totalUnread === 0}

                    title={totalUnread === 0 ? t("notif_inbox_mark_all_disabled_hint") : undefined}

                    onClick={() => void markAllRead()}

                    className="shrink-0 text-[13px] font-medium text-sam-muted underline-offset-2 hover:enabled:underline disabled:cursor-not-allowed disabled:opacity-45"

                  >

                    {markBusy ? t("common_processing") : t("notif_tier1_mark_read")}

                  </button>

                ) : (

                  <span className="text-[13px] text-sam-muted" />

                )}

                <button
                  type="button"
                  onClick={() => openNotificationsCenter()}
                  className="ml-auto shrink-0 rounded-full bg-sam-primary px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-[0.98]"
                >
                  {t("notif_tier1_see_all")}
                </button>

              </div>

            </div>

          </div>,

          document.body

        );



  return (

    <div className="inline-flex shrink-0 items-center">

      <button

        ref={triggerRef}

        type="button"

        onClick={() => {
          unlockNotificationSoundAudio();
          setOpen((v) => !v);
        }}

        className={
          triggerClassName ??
          (tone === "onPrimary"
            ? STORES_HOME_HEADER_ICON_BTN_CLASS
            : `${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative`)
        }

        aria-haspopup="dialog"

        aria-expanded={open || visible}

        aria-controls={visible ? panelId : undefined}

        aria-label={t("common_notifications")}

      >

        <span className={soundLoaded && !soundOn ? "opacity-70" : ""}>

          <BellGlyph muted={soundLoaded && !soundOn} />

        </span>

        {totalUnread > 0 ? (

          <span

            className={
              unreadBadgeClassName ??
              (tone === "onPrimary"
                ? STORES_HOME_HEADER_NOTIF_BADGE_CLASS
                : "absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-danger px-0.5 text-[9px] font-bold leading-none text-white")
            }

            aria-hidden

          >

            {totalUnread > 99 ? "99+" : totalUnread}

          </span>

        ) : null}

      </button>

      {panel}

      {domReady ? (

        <NotificationDeleteConfirmDialog

          open={pendingDelete != null}

          message={pendingDeleteMessage}

          cancelLabel={t("notif_inbox_delete_dialog_cancel")}

          confirmLabel={t("common_delete")}

          busy={pendingDelete != null && deleteBusyKey === pendingDelete.key}

          onCancel={() => setPendingDelete(null)}

          onConfirm={() => {

            const item = pendingDeleteRef.current;

            if (item) void runDeleteGroup(item);

          }}

        />

      ) : null}

    </div>

  );

}


