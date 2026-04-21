"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { useIntegratedChatRoomListRealtime } from "@/lib/chats/use-integrated-chat-room-list-realtime";
import { usePostsSellerListingRealtimeBatch } from "@/lib/chats/use-post-seller-listing-realtime";

/** 목록은 Realtime 미구독 구간만 갱신 — Supabase 쿼리·API 한도 완화를 위해 길게 */
const POLL_MS = 90_000;

/** 이 개수 이상이면 문서 스크롤 기준 가상화 — `measureElement`로 실측 보정되므로 추정은 약간 여유 있게 */
const CHAT_ROOM_LIST_VIRTUAL_THRESHOLD = 14;
const CHAT_ROOM_LIST_ROW_ESTIMATE_PX = 100;

export function ChatRoomList({
  segment,
  getRoomHref,
  onSelectRoom,
}: {
  segment: ChatRoomsListSegment;
  /** 미지정 시 `/chats/[roomId]` — 두 번째 인자로 `source` 쿼리(부트스트랩 힌트)에 사용 */
  getRoomHref?: (roomId: string, room: ChatRoom) => string;
  /** 지정 시 링크 이동 대신 콜백(홈 거래 채팅 시트 등) */
  onSelectRoom?: (roomId: string) => void;
}) {
  const { t } = useI18n();
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
        setError(t("common_fetch_list_failed"));
        setRooms([]);
        return;
      }
      setRooms(next);
      setError(null);
    } catch {
      setError(t("common_network_error"));
      setRooms([]);
    }
  }, [segment, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (sessionDenied) return;
    let inFlight = false;
    const safeLoad = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      void load().finally(() => {
        inFlight = false;
      });
    };
    let intervalId: number | null = null;
    const stopPoll = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPoll = () => {
      stopPoll();
      intervalId = window.setInterval(safeLoad, POLL_MS);
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        safeLoad();
        startPoll();
      } else {
        stopPoll();
      }
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, sessionDenied]);

  useEffect(() => {
    const onUnread = () => void load();
    window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onUnread);
  }, [load]);

  useRefetchOnPageShowRestore(() => {
    void load();
  });

  const viewerId = getCurrentUser()?.id?.trim() ?? null;
  const integratedRoomIds = useMemo(
    () => (rooms ?? []).filter((r) => r.source === "chat_room").map((r) => r.id.trim()).filter(Boolean),
    [rooms]
  );
  const tradePostIdsForListing = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rooms ?? []) {
      if (r.generalChat) continue;
      const pid = String(r.product?.id ?? r.productId ?? "").trim();
      if (pid) ids.add(pid);
    }
    return [...ids];
  }, [rooms]);
  useIntegratedChatRoomListRealtime({
    userId: viewerId,
    integratedRoomIds,
    enabled: !sessionDenied && rooms !== null && Boolean(viewerId),
    onListStale: load,
  });
  usePostsSellerListingRealtimeBatch({
    userId: viewerId,
    postIds: tradePostIdsForListing,
    enabled: !sessionDenied && rooms !== null && Boolean(viewerId) && tradePostIdsForListing.length > 0,
    onListStale: load,
  });

  const userId = viewerId ?? "";

  const useVirt = Boolean(rooms && rooms.length >= CHAT_ROOM_LIST_VIRTUAL_THRESHOLD);
  const rowVirtualizer = useVirtualizer({
    count: useVirt && rooms ? rooms.length : 0,
    getScrollElement: () =>
      typeof document !== "undefined" ? (document.scrollingElement ?? document.documentElement) : null,
    estimateSize: () => CHAT_ROOM_LIST_ROW_ESTIMATE_PX,
    overscan: 8,
  });

  if (rooms === null && !sessionDenied) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-muted`}>
        {t("common_loading")}
      </div>
    );
  }

  if (sessionDenied) {
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-sam-muted`}>
        <p>{t("common_login_required_for_chat_list")}</p>
        <Link href="/login" className="mt-3 inline-block font-medium text-signature underline">
          {t("common_login")}
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
          {t("common_retry")}
        </button>
      </div>
    );
  }

  if (!rooms || rooms.length === 0) {
    const emptyCopy =
      segment === "order"
        ? t(ORDER_CHAT_SURFACE.listEmptyMessageKey)
        : t(TRADE_CHAT_SURFACE.listEmptyMessageKey);
    const emptyCta =
      segment === "order"
        ? {
            href: ORDER_CHAT_SURFACE.emptyCtaHref,
            label: t(ORDER_CHAT_SURFACE.emptyCtaLabelKey),
          }
        : {
            href: TRADE_CHAT_SURFACE.emptyCtaHref,
            label: t(TRADE_CHAT_SURFACE.emptyCtaLabelKey),
          };
    return (
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} py-10 text-center text-sm text-muted`}>
        <p>{emptyCopy}</p>
        <Link href={emptyCta.href} className="mt-4 inline-block font-medium text-signature underline">
          {emptyCta.label}
        </Link>
      </div>
    );
  }

  const renderRoomRow = (room: ChatRoom) =>
    room.generalChat ? (
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
    );

  if (!useVirt) {
    return (
      <ul
        className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} space-y-0 divide-y divide-sam-border bg-sam-surface`}
      >
        {rooms.map((room) => (
          <li key={room.id}>{renderRoomRow(room)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div
      role="list"
      className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} relative bg-sam-surface`}
      style={{ height: rowVirtualizer.getTotalSize() }}
    >
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const room = rooms[vi.index];
        return (
          <div
            key={room.id}
            role="listitem"
            ref={rowVirtualizer.measureElement}
            data-index={vi.index}
            className="border-b border-sam-border last:border-b-0"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderRoomRow(room)}
          </div>
        );
      })}
    </div>
  );
}
