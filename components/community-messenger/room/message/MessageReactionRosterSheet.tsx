"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommunityMessengerMessageActionAnchorRect } from "@/lib/community-messenger/types";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type MessageReactionRosterSheetProps = {
  open: { messageId: string; reactionKey: string; anchor: CommunityMessengerMessageActionAnchorRect } | null;
  streamRoomId: string;
  onClose: () => void;
};

/** 이모티콘 pill 근처에 붙는 가벼운 ‘반응한 사람’ 팝오버 */
export function MessageReactionRosterSheet(props: MessageReactionRosterSheetProps) {
  const { open, streamRoomId, onClose } = props;
  const [users, setUsers] = useState<Array<{ userId: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const rosterFetchKey = open ? `${open.messageId}\u0000${open.reactionKey}` : "";

  useEffect(() => {
    if (!rosterFetchKey || !streamRoomId.trim()) {
      setUsers([]);
      setLoading(false);
      return;
    }
    const [messageId, reactionKey] = rosterFetchKey.split("\u0000");
    let cancelled = false;
    setLoading(true);
    const rk = encodeURIComponent(reactionKey);
    const rid = streamRoomId.trim();
    const url = `${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(messageId)}/reactions?reactionKey=${rk}`;
    const flightKey = `messenger:reaction-roster:${rid}:${messageId}:${reactionKey}`;
    void (async () => {
      try {
        const res = await runSingleFlight(flightKey, () =>
          fetch(url, { credentials: "include", cache: "no-store" })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          users?: Array<{ userId: string; label: string }>;
        };
        if (cancelled) return;
        if (json && json.ok === true && Array.isArray(json.users)) setUsers(json.users);
        else setUsers([]);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rosterFetchKey, streamRoomId]);

  useLayoutEffect(() => {
    if (!open) return;
    const layout = () => {
      const el = panelRef.current;
      const a = open.anchor;
      const vw = typeof window !== "undefined" ? window.innerWidth : 400;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const margin = 8;
      const pw = Math.min(260, vw - margin * 2);
      const ph = el?.offsetHeight ?? 160;
      let top = a.bottom + 6;
      if (top + ph > vh - margin) {
        top = Math.max(margin, a.top - ph - 6);
      }
      let left = a.left + a.width / 2 - pw / 2;
      left = Math.max(margin, Math.min(left, vw - pw - margin));
      setPos({ top, left });
    };
    layout();
    const el = panelRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(() => layout()) : null;
    ro?.observe(el!);
    const raf = requestAnimationFrame(() => layout());
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [open, loading, users.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[340] bg-black/15"
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="반응한 사람"
        className="fixed z-[341] w-[min(260px,calc(100vw-16px))] overflow-hidden rounded-xl border border-white/50 bg-white/90 shadow-lg backdrop-blur-md"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
          <span className="text-base leading-none">{open.reactionKey}</span>
          <span className="sam-text-xxs font-semibold text-[color:var(--cm-room-text-muted)]">반응한 사람</span>
        </div>
        <div className="max-h-[min(220px,40vh)] overflow-y-auto px-2 py-1.5">
          {loading ? (
            <p className="px-2 py-4 text-center sam-text-xxs text-[color:var(--cm-room-text-muted)]">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="px-2 py-4 text-center sam-text-xxs text-[color:var(--cm-room-text-muted)]">아직 없습니다.</p>
          ) : (
            <ul className="space-y-0.5">
              {users.map((u) => (
                <li
                  key={u.userId}
                  className="rounded-lg px-2.5 py-1.5 sam-text-xxs text-[color:var(--cm-room-text)]"
                >
                  {u.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
