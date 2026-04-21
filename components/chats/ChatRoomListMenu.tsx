"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";

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
      const msg =
        kind === "leave"
          ? t("nav_trade_leave_confirm")
          : t("nav_trade_hide_confirm");
      if (typeof window !== "undefined" && !window.confirm(msg)) return;
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
          window.alert(j.error ?? t("nav_trade_action_failed"));
          return;
        }
        setOpen(false);
        dispatchTradeChatUnreadUpdated({
          source: "chat-room-list-menu",
          key: `${roomId}:${kind}`,
        });
        onAfterAction?.();
      } catch {
        window.alert(t("nav_trade_network_error"));
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
          className="absolute right-0 top-full z-[25] mt-1 min-w-[168px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
          role="menu"
        >
          <li role="presentation">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
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
          <li role="presentation">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left sam-text-body text-red-600 hover:bg-sam-app disabled:opacity-50"
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
