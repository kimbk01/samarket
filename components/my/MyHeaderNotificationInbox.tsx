"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationDeleteConfirmDialog } from "@/components/notifications/NotificationDeleteConfirmDialog";
import { NotificationInboxByDateSections } from "@/components/notifications/NotificationInboxByDateSections";
import {
  fetchMeNotificationSettingsSnapshot,
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import {
  fetchMeNotificationsListDeduped,
  invalidateMeNotificationsListDedupedCache,
} from "@/lib/me/fetch-me-notifications-deduped";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";
import { buildInboxGroupItems, type InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { countUnread } from "@/lib/notifications/aggregate-inbox-summaries";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

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

function BellOnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

function BellMutedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
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

export function MyHeaderNotificationInbox() {
  const router = useRouter();
  const { t, language } = useI18n();
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const [soundBusy, setSoundBusy] = useState(false);

  const grouped = useMemo(() => buildInboxGroupItems(rows, language), [rows, language]);
  const rowUnread = useMemo(() => countUnread(rows), [rows]);
  const storeUnread = useSyncExternalStore(
    myGeneralNotificationUnreadStore.subscribe,
    myGeneralNotificationUnreadStore.getSnapshot,
    myGeneralNotificationUnreadStore.getServerSnapshot
  );
  const totalUnread = useMemo(() => {
    const su = storeUnread ?? 0;
    if (!open) return su;
    if (loading) return Math.max(su, rowUnread);
    return rowUnread;
  }, [open, loading, rowUnread, storeUnread]);

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
      if (force) invalidateMeNotificationsListDedupedCache();
      const { status, json: raw } = await fetchMeNotificationsListDeduped({ force, excludeChatMessages: true });
      const j = raw as { ok?: boolean; notifications?: Row[] };
      if (status === 401) {
        setRows([]);
        return;
      }
      setRows((j?.ok ? (j.notifications ?? []) : []) as Row[]);
    } catch {
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSound();
  }, [loadSound]);

  useEffect(() => {
    if (!open) return;
    void loadInbox(true);
  }, [open, loadInbox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCustom = () => {
      invalidateMeNotificationSettingsGetFlight();
      void loadSound();
    };
    const onInbox = () => {
      if (!open) return;
      void loadInbox(true, { silent: true });
    };
    window.addEventListener("kasama:user-notification-settings-changed", onCustom);
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);
    return () => {
      window.removeEventListener("kasama:user-notification-settings-changed", onCustom);
      window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onInbox);
    };
  }, [loadInbox, loadSound, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (!wrapperRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

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
      setRows((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
      }
    }
  }, []);

  const onActivate = async (item: InboxGroupItem) => {
    if (item.unreadCount > 0) await markIdsRead(item.ids);
    setOpen(false);
    invalidateMeNotificationsListDedupedCache();
    router.push(item.href);
  };

  const toggleSound = useCallback(async () => {
    if (soundBusy) return;
    setSoundBusy(true);
    const next = !soundOn;
    try {
      const res = await fetch("/api/me/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sound_enabled: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok) {
        setSoundOn(next);
        if (next && typeof window !== "undefined") primeNotificationSoundAudio();
        invalidateMeNotificationSettingsGetFlight();
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
      }
    } finally {
      setSoundBusy(false);
    }
  }, [soundBusy, soundOn]);

  const markAllRead = useCallback(async () => {
    if (markBusy || totalUnread === 0) return;
    setMarkBusy(true);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_my_notifications_read_excluding_owner_and_chat: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok) {
        invalidateMeNotificationsListDedupedCache();
        void loadInbox(true, { silent: true });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        }
      }
    } finally {
      setMarkBusy(false);
    }
  }, [loadInbox, markBusy, totalUnread]);

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
        setRows((prev) => prev.filter((r) => !item.ids.includes(r.id)));
        invalidateMeNotificationsListDedupedCache();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        }
      }
    } finally {
      setDeleteBusyKey(null);
      setPendingDelete(null);
    }
  }, []);

  const pendingDeleteMessage = useMemo(() => {
    if (!pendingDelete) return "";
    return pendingDelete.ids.length > 1
      ? t("notif_inbox_delete_group_confirm", { n: pendingDelete.ids.length })
      : t("notif_inbox_delete_confirm");
  }, [pendingDelete, t]);

  return (
    <div ref={wrapperRef} className="relative flex w-10 shrink-0 items-center justify-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sam-header-action relative h-10 w-10 text-sam-fg"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("common_notifications")}
      >
        <span className={soundLoaded && !soundOn ? "opacity-70" : ""}>
          {soundLoaded && !soundOn ? <BellMutedIcon /> : <BellOnIcon />}
        </span>
        {totalUnread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sam-primary px-0.5 text-[9px] font-bold leading-none text-sam-on-primary">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          className="absolute right-0 top-[46px] z-[120] flex h-[min(72vh,34rem)] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-[12px] border border-sam-border bg-sam-surface shadow-[0_18px_42px_-18px_rgba(0,0,0,0.45)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sam-border/80 px-3 py-2.5">
            <h2 className="min-w-0 text-[16px] font-bold leading-tight text-sam-fg">{t("notif_tier1_sheet_title")}</h2>
            <div className="flex shrink-0 items-center gap-1.5">
              {totalUnread > 0 ? (
                <span className="rounded-full bg-sam-primary/15 px-2 py-0.5 sam-text-xxs font-semibold text-sam-primary">
                  {totalUnread}
                </span>
              ) : null}
              <Link
                href="/mypage/notifications#notification-settings"
                onClick={() => setOpen(false)}
                className="sam-header-action flex h-8 w-8 items-center justify-center rounded-full text-sam-fg"
                aria-label={t("notif_tier1_to_settings")}
              >
                <SettingsGearIcon />
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {loading ? (
              <p className="px-2 py-2 sam-text-helper text-sam-muted">…</p>
            ) : (
              <NotificationInboxByDateSections
                items={grouped}
                compact
                emptyLabel={t("notif_tier1_empty")}
                onActivate={(item) => void onActivate(item)}
                onDelete={(item) => setPendingDelete(item)}
                deleteBusyKey={deleteBusyKey}
              />
            )}
          </div>

          <div className="shrink-0 border-t border-sam-border/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="sam-text-body text-sam-fg">{t("notif_tier1_inapp_sound")}</span>
              <button
                type="button"
                disabled={soundBusy || !soundLoaded}
                aria-pressed={soundOn}
                onClick={() => void toggleSound()}
                className={`shrink-0 rounded-full border px-3 py-1 sam-text-xxs font-semibold transition ${
                  soundOn
                    ? "border-sam-primary/40 bg-sam-primary/10 text-sam-primary"
                    : "border-sam-border text-sam-muted"
                }`}
              >
                {soundOn ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sam-border/50 px-3 py-2.5">
            <button
              type="button"
              disabled={markBusy || totalUnread === 0}
              title={totalUnread === 0 ? t("notif_inbox_mark_all_disabled_hint") : undefined}
              onClick={() => void markAllRead()}
              className="text-[13px] font-medium text-sam-muted underline-offset-2 hover:enabled:underline disabled:cursor-not-allowed disabled:opacity-45"
            >
              {markBusy ? t("common_processing") : t("notif_tier1_mark_read")}
            </button>
            <Link
              href="/mypage/notifications#notification-inbox"
              onClick={() => setOpen(false)}
              className="text-[14px] font-semibold text-sam-primary underline-offset-2 hover:underline"
            >
              {t("notif_tier1_see_all")}
            </Link>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
