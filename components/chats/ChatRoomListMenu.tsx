"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KASAMA_TRADE_CHAT_UNREAD_UPDATED } from "@/lib/chats/chat-channel-events";

type Props = {
  roomId: string;
  onAfterAction?: () => void;
  className?: string;
};

export function ChatRoomListMenu({ roomId, onAfterAction, className }: Props) {
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
          ? "이 채팅방에서 나가시겠어요? 나가면 목록에서 사라집니다."
          : "채팅방을 삭제(숨김)하시겠어요? 내 목록에서만 제거됩니다.";
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
          window.alert(j.error ?? "처리에 실패했습니다.");
          return;
        }
        setOpen(false);
        window.dispatchEvent(new CustomEvent(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
        onAfterAction?.();
      } catch {
        window.alert("네트워크 오류");
      } finally {
        setBusy(false);
      }
    },
    [busy, onAfterAction, roomId]
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-expanded={open}
        aria-label="채팅 메뉴"
        aria-haspopup="menu"
        disabled={busy}
      >
        <DotsVerticalIcon />
      </button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-[25] mt-1 min-w-[168px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          <li role="presentation">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void run("leave");
              }}
            >
              채팅방 나가기
            </button>
          </li>
          <li role="presentation">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-[14px] text-red-600 hover:bg-gray-50 disabled:opacity-50"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void run("hide");
              }}
            >
              채팅방 삭제
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
