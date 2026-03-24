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
import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";

/** 채팅 상세·주문 미읽음 폴링(12s)과 맞춰 목록 API 부하 완화, 탭 비가시 시 호출 안 함 */
const POLL_MS = 12_000;

export function ChatRoomList({
  segment,
  getRoomHref,
}: {
  segment: "trade" | "order";
  /** 미지정 시 `/chats/[roomId]` */
  getRoomHref?: (roomId: string) => string;
}) {
  const [mounted, setMounted] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const user = mounted ? getCurrentUser() : null;
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setRooms([]);
      return;
    }
    try {
      const { ok, status, rooms: next } = await fetchChatRoomsBySegment(segment);
      if (status === 401) {
        setRooms([]);
        setError(null);
        return;
      }
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
  }, [segment, userId]);

  useEffect(() => {
    if (!mounted) return;
    void load();
  }, [mounted, load]);

  useEffect(() => {
    if (!mounted || !userId) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [mounted, load, userId]);

  useEffect(() => {
    if (!mounted) return;
    const onUnread = () => void load();
    window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
  }, [mounted, load]);

  useRefetchOnPageShowRestore(() => {
    if (mounted) void load();
  });

  if (!mounted) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-gray-500`}>
        불러오는 중…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-gray-600`}>
        <p>로그인 후 채팅 목록을 볼 수 있어요.</p>
        <Link href="/login" className="mt-3 inline-block font-medium text-violet-700 underline">
          로그인
        </Link>
      </div>
    );
  }

  if (rooms === null) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-gray-500`}>
        불러오는 중…
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
          className="mt-3 block w-full font-medium text-violet-700 underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-gray-500`}>
        {segment === "order"
          ? ORDER_CHAT_SURFACE.listEmptyMessage
          : TRADE_CHAT_SURFACE.listEmptyMessage}
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
            />
          ) : (
            <ChatRoomCard
              room={room}
              currentUserId={userId}
              onRoomMutated={() => void load()}
              getRoomHref={getRoomHref}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
