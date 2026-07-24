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

import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";

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
import { suppressCmRoomEntryNotificationSound } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";

import { getSurfaceNotificationUnreadStore, refreshActiveSurfaceNotificationUnreadStores } from "@/lib/notifications/notification-unread-badge-store";
import { resyncBadgesAfterNotificationEventsRead, applyTier1InboxMarkAllReadOptimistic } from "@/lib/notifications/client/notification-events-read-resync";

import {

  resolveTier1HeaderBellBadgeTotal,

  syncTier1HeaderInboxUnreadFromRows,

} from "@/lib/notifications/tier1-header-inbox-sync";

import {
  badgeSurfaceToPriorityPushKind,
  resolveTier1BellListFetchOpts,
  resolveTier1BellMarkAllReadBody,
  resolveTier1BellSurfaceFromPathname,
  type Tier1BellBadgeSurface,
} from "@/lib/notifications/resolve-tier1-bell-surface";

import {
  getNotificationBadgeCountSnapshot,
  getNotificationBadgeCountServerSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";

export type { Tier1BellBadgeSurface };

import {

  buildInboxGroupItems,

  type InboxGroupItem,

} from "@/lib/notifications/group-inbox-by-thread";

import { countUnread } from "@/lib/notifications/aggregate-inbox-summaries";

import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

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

  /** 패널 상단 고정(친구 요청 등) */

  pinnedSections?: ReactNode;

  /** surface badge store 외 추가 미확인 건(메신저 주요 알림 등) */

  supplementalUnreadCount?: number;

}) {

  const pathname = usePathname();

  const resolvedSurface = surfaceProp ?? resolveTier1BellSurfaceFromPathname(pathname);

  const listFetchOpts = useMemo(
    () => resolveTier1BellListFetchOpts(resolvedSurface, storeId),
    [resolvedSurface, storeId]
  );

  const priorityPushKind = useMemo(
    () => badgeSurfaceToPriorityPushKind(resolvedSurface),
    [resolvedSurface]
  );

  const badgeStore = useMemo(
    () => getSurfaceNotificationUnreadStore(resolvedSurface, storeId),
    [resolvedSurface, storeId]
  );

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
    () => buildInboxGroupItems(rows, language, priorityPushKind),
    [rows, language, priorityPushKind]
  );

  const rowUnread = useMemo(() => countUnread(rows), [rows]);

  const storeUnread = useSyncExternalStore(

    badgeStore.subscribe,

    badgeStore.getSnapshot,

    badgeStore.getServerSnapshot

  );

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
        storeUnread,
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
      storeUnread,
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
        pushKind: listFetchOpts.pushKind,
        ownerStoreId: listFetchOpts.ownerStoreId,
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

      const nextRows = (j.notifications ?? []) as Row[];

      setRows(nextRows);

      setListSynced(true);

      syncTier1HeaderInboxUnreadFromRows(nextRows);

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



  useEffect(() => {
    setListSynced(false);
    setRows([]);
  }, [resolvedSurface, storeId]);



  useEffect(() => {

    if (typeof window === "undefined") return;

    const onCustom = () => {

      invalidateMeNotificationSettingsGetFlight();

      void loadSound();

    };

    const onInbox = () => {

      void loadInbox(true, { silent: true });

      void badgeStore.refresh(true);

    };

    window.addEventListener("kasama:user-notification-settings-changed", onCustom);

    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);

    return () => {

      window.removeEventListener("kasama:user-notification-settings-changed", onCustom);

      window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);

    };

  }, [loadInbox, loadSound, badgeStore]);



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

    void badgeStore.refresh(true);

  }, [open, listSynced, loadInbox, badgeStore]);



  const markIdsRead = useCallback(async (ids: string[]) => {

    if (ids.length === 0) return;

    const res = await fetch("/api/me/notifications", {

      method: "PATCH",

      credentials: "include",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ ids }),

    });

    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };

    if (res.ok && j?.ok) {

      setRows((prev) => {

        const next = prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x));

        syncTier1HeaderInboxUnreadFromRows(next);

        return next;

      });

      if (typeof window !== "undefined") {

        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));

      }

      resyncBadgesAfterNotificationEventsRead("notification_opened");
      refreshActiveSurfaceNotificationUnreadStores(pathname, true);
      void badgeStore.refresh(true);

    }

  }, [badgeStore, pathname]);



  const onActivate = async (item: InboxGroupItem) => {
    suppressCmRoomEntryNotificationSound(item.href);
    if (item.unreadCount > 0) {
      await markIdsRead(item.ids);
    }

    prewarmInboxNotificationChatHref(router, item.href);

    closePanel();

    invalidateMeNotificationsListDedupedCache();

    router.push(item.href);
  };



  const onItemWarm = (item: InboxGroupItem) => {

    prewarmInboxNotificationChatHref(router, item.href);

  };



  const markAllRead = useCallback(async () => {

    if (markBusy || totalUnread === 0) return;

    setMarkBusy(true);

    try {
      const unreadIds = grouped
        .filter((g) => g.unreadCount > 0)
        .flatMap((g) => g.ids);
      const rowUnreadIds = rows.filter((r) => !r.is_read).map((r) => r.id);
      const markBody =
        resolvedSurface === "tier1_inbox_bell"
          ? ({ mark_my_notifications_read_excluding_owner_and_chat: true } as const)
          : resolveTier1BellMarkAllReadBody(
              resolvedSurface,
              unreadIds.length > 0 ? unreadIds : rowUnreadIds
            );

      const res = await fetch("/api/me/notifications", {

        method: "PATCH",

        credentials: "include",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(markBody),

      });

      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };

      if (res.ok && j?.ok) {

        setRows((prev) => prev.map((x) => ({ ...x, is_read: true })));

        if (resolvedSurface === "tier1_inbox_bell") {
          applyTier1InboxMarkAllReadOptimistic();
        }

        invalidateMeNotificationsListDedupedCache();

        await loadInbox(true, { silent: true });

        await badgeStore.refresh(true);

        if (typeof window !== "undefined") {

          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));

        }

        resyncBadgesAfterNotificationEventsRead("mark_all_read_cross_tab");
        refreshActiveSurfaceNotificationUnreadStores(pathname, true);

      }

    } finally {

      setMarkBusy(false);

    }

  }, [badgeStore, grouped, loadInbox, markBusy, pathname, resolvedSurface, rows, totalUnread]);



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

          const next = prev.filter((r) => !item.ids.includes(r.id));

          syncTier1HeaderInboxUnreadFromRows(next);

          return next;

        });

        invalidateMeNotificationsListDedupedCache();

        await badgeStore.refresh(true);

        void loadInbox(true, { silent: true });

        resyncBadgesAfterNotificationEventsRead("notification_opened");
        refreshActiveSurfaceNotificationUnreadStores(pathname, true);

        if (typeof window !== "undefined") {

          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));

        }

      }

    } finally {

      setDeleteBusyKey(null);

      setPendingDelete(null);

    }

  }, [badgeStore, loadInbox, pathname]);



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

                    <span className="rounded-full bg-sam-primary/15 px-2 py-0.5 sam-text-xxs font-semibold leading-none text-sam-primary">

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



              <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sam-surface py-2 ${APP_MAIN_GUTTER_X_CLASS}`}>

                {pinnedSections ? (
                  <div className="mb-2 border-b border-sam-border/60 pb-2">{pinnedSections}</div>
                ) : null}

                {showListLoading ? (

                  <p className="px-2 py-2 sam-text-helper text-sam-muted">{t("common_loading")}</p>

                ) : (

                  <NotificationInboxByDateSections

                    items={grouped}

                    compact

                    emptyLabel={t("notif_tier1_empty")}

                    onItemWarm={onItemWarm}

                    onActivate={(item) => onActivate(item)}

                    onDelete={(item) => requestDeleteGroup(item)}

                    deleteBusyKey={deleteBusyKey}

                  />

                )}

              </div>



              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-sam-border/50 px-3 py-2.5">

                {!showListLoading && rows.length > 0 ? (

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

                <Link

                  href="/mypage/notifications#notification-inbox"

                  onClick={closePanel}

                  className="ml-auto shrink-0 text-[14px] font-semibold text-sam-primary underline-offset-2 hover:underline"

                >

                  {t("notif_tier1_see_all")}

                </Link>

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

          primeNotificationSoundAudio();

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
                : "absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary")
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


