"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getOwnerHubBadgeSnapshot, subscribeOwnerHubBadge } from "@/lib/chats/owner-hub-badge-store";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import {
  isUnifiedChatRoomDetailPath,
  orderChatUnreadSoundBaselineKey,
} from "@/lib/chats/chat-room-path-utils";

/**
 * 로그인 시 채팅 미읽음 합계 증가를 감시해 짧은 알림음 1회.
 * 별도 미읽음 전용 폴링을 두지 않고, 하단 탭과 공유하는
 * owner hub badge store를 재사용해 중복 트래픽을 줄입니다.
 */
export function GlobalOrderChatUnreadSound({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(pathname);
  pathnameRef.current = pathname;
  const baselineKey = useMemo(() => orderChatUnreadSoundBaselineKey(pathname), [pathname]);
  const prevSnapRef = useRef<OwnerHubBadgeBreakdown | null>(null);
  const [viewerUid, setViewerUid] = useState<string | null>(null);

  /** 표면 구간이 바뀔 때만 기준 스냅샷 리셋 — 세션은 아래 effect 에서만 */
  useEffect(() => {
    if (!enabled) return;
    prevSnapRef.current = getOwnerHubBadgeSnapshot();
  }, [enabled, baselineKey]);

  useEffect(() => {
    if (!enabled) return;
    const syncViewer = () => {
      void getCurrentUserIdForDb().then((id) => setViewerUid((prev) => (prev === id ? prev : id)));
    };
    syncViewer();
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      syncViewer();
    });
    return () => {
      authSub?.data.subscription.unsubscribe();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onTestAuth = () => {
      void getCurrentUserIdForDb().then((id) => setViewerUid((prev) => (prev === id ? prev : id)));
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!viewerUid) return;

    const syncFromSharedStore = () => {
      const snap = getOwnerHubBadgeSnapshot();
      const prev = prevSnapRef.current;
      const path = pathnameRef.current;
      if (!isUnifiedChatRoomDetailPath(path) && prev !== null) {
        /** 합계만 보면 거래/커뮤니티/매장 채팅을 구분할 수 없음 — 항목별 증가분에 맞는 도메인 알림음 */
        if (snap.chatUnread > prev.chatUnread) {
          void playDomainNotificationSound("trade_chat");
        } else if (snap.philifeChatUnread > prev.philifeChatUnread) {
          void playDomainNotificationSound("community_direct_chat");
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
      prevSnapRef.current = null;
    };
  }, [enabled, viewerUid]);

  return null;
}
