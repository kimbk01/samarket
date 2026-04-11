"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getOwnerHubBadgeSnapshot, subscribeOwnerHubBadge } from "@/lib/chats/owner-hub-badge-store";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { isUnifiedChatRoomDetailPath } from "@/lib/chats/chat-room-path-utils";

/**
 * 로그인 시 채팅 미읽음 합계 증가를 감시해 짧은 알림음 1회.
 * 별도 미읽음 전용 폴링을 두지 않고, 하단 탭과 공유하는
 * owner hub badge store를 재사용해 중복 트래픽을 줄입니다.
 */
export function GlobalOrderChatUnreadSound() {
  const pathname = usePathname();
  const prevSnapRef = useRef<OwnerHubBadgeBreakdown | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    const uid = user?.id;
    if (!uid) {
      prevSnapRef.current = null;
      return;
    }

    const syncFromSharedStore = () => {
      const snap = getOwnerHubBadgeSnapshot();
      const prev = prevSnapRef.current;
      if (!isUnifiedChatRoomDetailPath(pathname) && prev !== null) {
        /** 합계만 보면 거래/커뮤니티/매장 채팅을 구분할 수 없음 — 항목별 증가분에 맞는 도메인 알림음 */
        if (snap.chatUnread > prev.chatUnread) {
          void playDomainNotificationSound("trade_chat");
        } else if (snap.philifeChatUnread > prev.philifeChatUnread) {
          void playDomainNotificationSound("community_chat");
        } else if (snap.storeOrderChatUnread > prev.storeOrderChatUnread) {
          void playDomainNotificationSound("store");
        }
      }
      prevSnapRef.current = snap;
    };

    syncFromSharedStore();
    const unsubscribe = subscribeOwnerHubBadge(syncFromSharedStore);
    /* 배지 fetch는 subscribe → startHub → fetchOwnerHubBadgeNow 에서만 (경로 바뀔 때마다 중복 호출 방지) */

    return () => {
      unsubscribe();
    };
  }, [pathname]);

  return null;
}
