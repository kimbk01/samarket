"use client";

import { useEffect } from "react";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";

/** 거래 채팅 방 — 글로벌 알림/배너가 동일 방 컨텍스트를 알도록 동기화 */
export function useNotificationSurfaceTradeChatRoom(roomId: string | null | undefined): void {
  const notifSurface = useNotificationSurface();
  useEffect(() => {
    if (!notifSurface || !roomId?.trim()) return;
    const id = roomId.trim();
    notifSurface.setExplicitTradeChatRoomId(id);
    return () => {
      notifSurface.setExplicitTradeChatRoomId(null);
    };
  }, [notifSurface, roomId]);
}

/** 커뮤니티 메신저 방 — 동일 패턴, API 분리 유지 */
export function useNotificationSurfaceCommunityMessengerRoom(roomId: string | null | undefined): void {
  const notifSurface = useNotificationSurface();
  useEffect(() => {
    if (!notifSurface || !roomId?.trim()) return;
    const id = roomId.trim();
    notifSurface.setExplicitCommunityChatRoomId(id);
    return () => {
      notifSurface.setExplicitCommunityChatRoomId(null);
    };
  }, [notifSurface, roomId]);
}
