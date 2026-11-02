"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  roomId: string;
  onAfterAction?: () => void;
  className?: string;
};

export function ChatRoomListMenu({ roomId, onAfterAction, className }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = useCallback(
    async (kind: "leave" | "hide") => {
      if (busy) return;
      if (
        !(await dibayConfirm(
          kind === "leave"
            ? {
                title: t("popup_chat_room_leave_title"),
                description: t("popup_chat_room_leave_desc"),
                cancelLabel: t("common_cancel"),
                confirmLabel: t("popup_cta_leave"),
                confirmTone: "destructive",
              }
            : {
                title: t("popup_chat_room_delete_title"),
                description: t("popup_chat_room_delete_desc"),
                cancelLabel: t("common_cancel"),
                confirmLabel: t("common_delete"),
                confirmTone: "destructive",
              }
        ))
      )
        return;
      setBusy(true);
      try {
        const path = kind === "leave" ? "leave" : "hide";
        const res = await fetch(`/api/chat/rooms/${encodeURIComponent(roomId)}/${path}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          await dibayAlert(
            j.error
              ? { title: t("popup_error_title"), description: j.error }
              : { title: t("nav_trade_action_failed") }
          );
          return;
        }
        setOpen(false);
        dispatchTradeChatUnreadUpdated({
          source: "chat-room-list-menu",
          key: `${roomId}:${kind}`,
        });
        onAfterAction?.();
      } catch {
        await dibayAlert({ title: t("nav_trade_network_error") });
      } finally {
        setBusy(false);
      }
    },
    [busy, onAfterAction, roomId, t]
  );

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sam-primary-soft"
        aria-expanded={open}
        aria-label={t("common_chat_menu")}
        aria-haspopup="menu"
        disabled={busy}
      >
        <DotsVerticalIcon />
      </button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-[25] mt-1 min-w-[168px] max-w-[min(92vw,280px)] overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] py-1 text-[color:var(--overlay-text-primary)] shadow-[var(--overlay-elevation-2)]"
          role="menu"
        >
          <li role="presentation">
            <button
              type="button"
              role="menuitem"
              className={`${OverlayUi.popoverItem} disabled:cursor-not-allowed`}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void run("leave");
              }}
            >
              {t("common_leave_chat_room")}
            </button>
          </li>
          <li role="presentation" className="border-t border-[color:var(--overlay-border)]">
            <button
              type="button"
              role="menuitem"
              className={`${OverlayUi.popoverItemDanger} disabled:cursor-not-allowed`}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void run("hide");
              }}
            >
              {t("common_delete_chat_room")}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function DotsVerticalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
