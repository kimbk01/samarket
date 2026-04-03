"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatDetailView } from "@/components/chats/ChatDetailView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ChatRoom } from "@/lib/types/chat";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  fetchIntegratedChatRoomMessages,
  fetchLegacyChatRoomMessages,
} from "@/lib/chats/fetch-chat-room-messages-api";

function isChatRoomPayload(j: unknown): j is ChatRoom {
  if (!j || typeof j !== "object") return false;
  const o = j as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.buyerId === "string" &&
    typeof o.sellerId === "string" &&
    !("error" in o && o.error != null)
  );
}

export function ChatRoomScreen({
  roomId,
  openReviewOnMount = false,
  listHref,
  onListNavigate,
  embedded = false,
  embeddedFill = false,
  tradeHubColumnLayout = false,
  ownerStoreOrderModalChrome = false,
}: {
  roomId: string | null;
  openReviewOnMount?: boolean;
  /** 오류·빈 화면에서 «목록으로» 링크 */
  listHref: string;
  /** 라우팅 없이 거래채팅 목록(시트 등)으로 복귀 */
  onListNavigate?: () => void;
  embedded?: boolean;
  /** embedded일 때 세로 풀 높이(모임방 전체 화면) */
  embeddedFill?: boolean;
  /** `/mypage/trade/chat/[room]` — 거래 허브 탭 아래 컬럼 높이 + 스티키 보정 */
  tradeHubColumnLayout?: boolean;
  /** 매장 주문 관리 모달 — 상단 탭(채팅·주문)만 표시 */
  ownerStoreOrderModalChrome?: boolean;
}) {
  const [[authReady, currentUserId], setAuth] = useState<[boolean, string | null]>(() => [false, null]);

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useLayoutEffect(() => {
    setAuth([true, getCurrentUser()?.id?.trim() ?? null]);
  }, []);

  const reload = useCallback(async () => {
    if (!roomId) {
      setErr("bad_room");
      setRoom(null);
      setLoading(false);
      return;
    }
    if (!currentUserId) {
      setLoading(false);
      setRoom(null);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 28_000);
    try {
      const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const j: unknown = await res.json().catch(() => null);
      if (res.status === 404) {
        setErr("not_found");
        setRoom(null);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setErr("auth");
        setRoom(null);
        return;
      }
      if (!res.ok || !isChatRoomPayload(j)) {
        setErr("load_failed");
        setRoom(null);
        return;
      }
      if (j.source === "chat_room") {
        void fetchIntegratedChatRoomMessages(j.id);
      } else {
        void fetchLegacyChatRoomMessages(j.id);
      }
      setRoom(j);
    } catch {
      setErr("network");
      setRoom(null);
    } finally {
      window.clearTimeout(tid);
      setLoading(false);
    }
  }, [roomId, currentUserId]);

  useEffect(() => {
    if (!authReady) return;
    void reload();
  }, [authReady, reload]);

  const authReadyRef = useRef(authReady);
  authReadyRef.current = authReady;
  useRefetchOnPageShowRestore(() => {
    if (!authReadyRef.current) return;
    void reload();
  });

  const viewportClass =
    embedded && embeddedFill ? "" : embedded ? "" : VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS;

  const embeddedEmptyClass =
    embedded && embeddedFill
      ? "flex min-h-[180px] flex-1 flex-col items-center justify-center px-4 text-center"
      : embedded
        ? "min-h-[240px] rounded-2xl border border-gray-100 bg-white"
        : "min-h-[50vh]";

  if (!roomId) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">잘못된 채팅방 주소입니다.</p>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-3 font-medium text-signature underline">
            목록으로
          </button>
        ) : (
          <Link href={listHref} className="mt-3 font-medium text-signature underline" replace scroll={false}>
            목록으로
          </Link>
        )}
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className={`flex items-center justify-center text-sm text-[#8E8E8E] ${embeddedEmptyClass}`}>불러오는 중…</div>
    );
  }

  if (!currentUserId) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">로그인이 필요합니다.</p>
        <Link href="/login" className="mt-3 font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center text-sm text-[#8E8E8E] ${embeddedEmptyClass}`}>불러오는 중…</div>
    );
  }

  if (err === "not_found") {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">채팅방을 찾을 수 없습니다.</p>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-3 font-medium text-signature underline">
            목록으로
          </button>
        ) : (
          <Link href={listHref} className="mt-3 font-medium text-signature underline" replace scroll={false}>
            목록으로
          </Link>
        )}
      </div>
    );
  }

  if (err || !room) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-red-600">
          {err === "auth" ? "접근 권한이 없습니다." : "채팅방을 불러오지 못했습니다."}
        </p>
        <button type="button" onClick={() => void reload()} className="mt-3 font-medium text-signature underline">
          다시 시도
        </button>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-2 text-sm text-gray-600 underline">
            목록으로
          </button>
        ) : (
          <Link href={listHref} replace scroll={false} className="mt-2 text-sm text-gray-600 underline">
            목록으로
          </Link>
        )}
      </div>
    );
  }

  const isStoreOrderChat = room.generalChat?.kind === "store_order";
  const igDmOuter = isStoreOrderChat || !room.generalChat;

  const outerClass =
    embedded && embeddedFill
      ? `flex min-h-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-white" : "bg-[#e8e4df]"}`
      : tradeHubColumnLayout && !embedded
        ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-white" : "bg-[#e8e4df]"}`
        : `${igDmOuter ? "bg-white" : "bg-[#e8e4df]"} ${
            embedded ? "overflow-hidden rounded-2xl border border-gray-100 shadow-sm" : viewportClass
          }`;

  return (
    <div className={outerClass}>
      <ChatDetailView
        room={room}
        currentUserId={currentUserId}
        onRoomReload={() => void reload()}
        openReviewOnMount={openReviewOnMount}
        listHref={listHref}
        onListNavigate={onListNavigate}
        embedded={embedded}
        embeddedFill={embeddedFill}
        tradeHubColumnLayout={tradeHubColumnLayout}
        ownerStoreOrderModalChrome={ownerStoreOrderModalChrome}
      />
    </div>
  );
}
