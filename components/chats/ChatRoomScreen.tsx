"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChatDetailView } from "@/components/chats/ChatDetailView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ChatRoom } from "@/lib/types/chat";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";

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
}: {
  roomId: string | null;
  openReviewOnMount?: boolean;
  /** 오류·빈 화면에서 «목록으로» 링크 */
  listHref: string;
}) {
  const [mounted, setMounted] = useState(false);
  const currentUserId = mounted ? (getCurrentUser()?.id ?? null) : null;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}`, {
        credentials: "include",
        cache: "no-store",
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
      setRoom(j);
    } catch {
      setErr("network");
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [roomId, currentUserId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void reload();
  }, [mounted, reload]);

  useRefetchOnPageShowRestore(() => {
    if (!mounted) return;
    void reload();
  });

  const viewportClass = VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS;

  if (!roomId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-600">잘못된 채팅방 주소입니다.</p>
        <Link href={listHref} className="mt-3 font-medium text-violet-700 underline" replace scroll={false}>
          목록으로
        </Link>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">불러오는 중…</div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-600">로그인이 필요합니다.</p>
        <Link href="/login" className="mt-3 font-medium text-violet-700 underline">
          로그인
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">불러오는 중…</div>
    );
  }

  if (err === "not_found") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-600">채팅방을 찾을 수 없습니다.</p>
        <Link href={listHref} className="mt-3 font-medium text-violet-700 underline" replace scroll={false}>
          목록으로
        </Link>
      </div>
    );
  }

  if (err || !room) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-red-600">
          {err === "auth" ? "접근 권한이 없습니다." : "채팅방을 불러오지 못했습니다."}
        </p>
        <button type="button" onClick={() => void reload()} className="mt-3 font-medium text-violet-700 underline">
          다시 시도
        </button>
        <Link href={listHref} replace scroll={false} className="mt-2 text-sm text-gray-600 underline">
          목록으로
        </Link>
      </div>
    );
  }

  const isStoreOrderChat = room.generalChat?.kind === "store_order";

  return (
    <div
      className={`${isStoreOrderChat ? "bg-white" : "bg-[#e8e4df]"} ${viewportClass}`}
    >
      <ChatDetailView
        room={room}
        currentUserId={currentUserId}
        onRoomReload={() => void reload()}
        openReviewOnMount={openReviewOnMount}
      />
    </div>
  );
}
