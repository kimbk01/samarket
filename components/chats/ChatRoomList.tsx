"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChatRoom } from "@/lib/types/chat";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { KASAMA_TRADE_CHAT_UNREAD_UPDATED } from "@/lib/chats/chat-channel-events";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { ChatRoomCard } from "./ChatRoomCard";
import { GeneralChatRoomCard } from "./GeneralChatRoomCard";
import { ORDER_CHAT_SURFACE } from "@/lib/chats/surfaces/order-chat-surface";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  fetchChatRoomsBySegment,
  type ChatRoomsListSegment,
} from "@/lib/chats/fetch-chat-rooms-by-segment";

/** 목록은 Realtime 미구독 구간만 갱신 — Supabase 쿼리·API 한도 완화를 위해 길게 */
const POLL_MS = 90_000;

export function ChatRoomList({
  segment,
  getRoomHref,
  onSelectRoom,
}: {
  segment: ChatRoomsListSegment;
  /** 미지정 시 `/chats/[roomId]` */
  getRoomHref?: (roomId: string) => string;
  /** 지정 시 링크 이동 대신 콜백(홈 거래 채팅 시트 등) */
  onSelectRoom?: (roomId: string) => void;
}) {
  const [rooms, setRooms] = useState<ChatRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 서버 401 — `getCurrentUser()` 지연과 무관하게 판별 */
  const [sessionDenied, setSessionDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { ok, status, rooms: next } = await fetchChatRoomsBySegment(segment);
      if (status === 401) {
        setSessionDenied(true);
        setRooms([]);
        setError(null);
        return;
      }
      setSessionDenied(false);
      if (!ok) {
        setError("목록을 불러오지 못했습니다.");
        setRooms([]);
        return;
      }
      setRooms(next);
      setError(null);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setRooms([]);
    }
  }, [segment]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (sessionDenied) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, sessionDenied]);

  useEffect(() => {
    const onUnread = () => void load();
    window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
  }, [load]);

  useRefetchOnPageShowRestore(() => {
    void load();
  });

  const userId = getCurrentUser()?.id ?? "";

  if (rooms === null && !sessionDenied) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-[#8E8E8E]`}>
        불러오는 중…
      </div>
    );
  }

  if (sessionDenied) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-gray-600`}>
        <p>로그인 후 채팅 목록을 볼 수 있어요.</p>
        <Link href="/login" className="mt-3 inline-block font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-red-600`}>
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 block w-full font-medium text-signature underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!rooms || rooms.length === 0) {
    const emptyCopy =
      segment === "order"
        ? ORDER_CHAT_SURFACE.listEmptyMessage
        : TRADE_CHAT_SURFACE.listEmptyMessage;
    const emptyCta =
      segment === "order"
        ? {
            href: ORDER_CHAT_SURFACE.emptyCtaHref,
            label: ORDER_CHAT_SURFACE.emptyCtaLabel,
          }
        : {
            href: TRADE_CHAT_SURFACE.emptyCtaHref,
            label: TRADE_CHAT_SURFACE.emptyCtaLabel,
          };
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-[#8E8E8E]`}>
        <p>{emptyCopy}</p>
        <Link href={emptyCta.href} className="mt-4 inline-block font-medium text-signature underline">
          {emptyCta.label}
        </Link>
      </div>
    );
  }

  return (
    <ul className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} space-y-0 divide-y divide-gray-200 bg-white`}>
      {rooms.map((room) => (
        <li key={room.id}>
          {room.generalChat ? (
            <GeneralChatRoomCard
              room={room}
              onRoomMutated={() => void load()}
              getRoomHref={getRoomHref}
              onSelectRoom={onSelectRoom}
            />
          ) : (
            <ChatRoomCard
              room={room}
              currentUserId={userId}
              onRoomMutated={() => void load()}
              getRoomHref={getRoomHref}
              onSelectRoom={onSelectRoom}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
