"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { isNotificationDomain, type NotificationDomain } from "@/lib/notifications/notification-domains";

export type SupabaseNotificationsRealtimeOptions = {
  /** false면 구독 자체를 생성하지 않음 (라우트 전환 시 재마운트/재구독 비용을 구조적으로 제거하기 위한 게이트) */
  enabled?: boolean;
  /** true면 신규 알림(INSERT) 시 MP3 재생 */
  playSoundOnInsert?: boolean;
  /**
   * 설정되면 INSERT 시 기본 재생 대신 호출 — 도메인별 당근 스타일 제어용.
   * false 를 반환하면 무음.
   */
  onInsertSound?: (row: Record<string, unknown>) => boolean | void;
};

function isInsertEvent(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "eventType" in payload &&
    (payload as { eventType?: string }).eventType === "INSERT"
  );
}

function shouldPlaySoundForNotificationInsert(payload: unknown): boolean {
  if (!isInsertEvent(payload)) return false;
  return true;
}

/**
 * Supabase 세션이 있을 때 `public.notifications` INSERT/UPDATE마다 onChange 호출.
 * 앱당 채널 1개(`notifications-rt:${userId}`) — 복수 구독 시 Realtime·워커 부하만 증가.
 */
export function useSupabaseNotificationsRealtime(
  onChange: () => void,
  options?: SupabaseNotificationsRealtimeOptions
) {
  const onChangeRef = useRef(onChange);
  const playSoundOnInsertRef = useRef(options?.playSoundOnInsert ?? false);
  const onInsertSoundRef = useRef(options?.onInsertSound);
  const enabled = options?.enabled !== false;

  useEffect(() => {
    onChangeRef.current = onChange;
    playSoundOnInsertRef.current = options?.playSoundOnInsert ?? false;
    onInsertSoundRef.current = options?.onInsertSound;
  }, [onChange, options?.onInsertSound, options?.playSoundOnInsert]);

  useEffect(() => {
    if (!enabled) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let currentSub: { stop: () => void; markSignal: () => void } | null = null;

    const subscribeForUser = (uid: string) => {
      if (cancelled || !uid) return;
      if (currentSub) {
        currentSub.stop();
        currentSub = null;
      }
      let markRealtimeSignal = () => {};
      const sub = subscribeWithRetry({
        sb,
        name: `notifications-rt:${uid}`,
        scope: `notifications-rt:${uid}`,
        isCancelled: () => cancelled,
        silentAfterMs: 18_000,
        build: (channel) =>
          channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            markRealtimeSignal();
            if (playSoundOnInsertRef.current && shouldPlaySoundForNotificationInsert(payload)) {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              const onInsertSound = onInsertSoundRef.current;
              if (onInsertSound) {
                const r = onInsertSound(row);
                if (r === false) {
                  onChangeRef.current();
                  return;
                }
                if (r === true) {
                  onChangeRef.current();
                  return;
                }
              }
              const nid = row?.id != null && String(row.id).trim() ? String(row.id).trim() : "";
              const domain = row?.domain;
              if (typeof domain === "string" && isNotificationDomain(domain)) {
                const metaAny = row?.meta as { kind?: string } | undefined;
                const routedDomain =
                  domain === "community_chat"
                    ? metaAny?.kind === "group_chat"
                      ? "community_group_chat"
                      : "community_direct_chat"
                    : (domain as NotificationDomain);
                void playDomainNotificationSound(routedDomain);
              } else {
                /** domain 컬럼 없이 저장된 레거시 행 — meta.kind 로 관리자 알림음 도메인 연동 */
                const meta = row?.meta as { kind?: string } | undefined;
                const chatKind = typeof meta?.kind === "string" ? meta.kind : "";
                if (row?.notification_type === "chat" && chatKind === "trade_chat") {
                  void playDomainNotificationSound("trade_chat");
                } else if (row?.notification_type === "chat" && chatKind === "community_chat") {
                  void playDomainNotificationSound("community_direct_chat");
                } else if (row?.notification_type === "chat" && chatKind === "group_chat") {
                  void playDomainNotificationSound("community_group_chat");
                } else {
                  const isChat = row?.notification_type === "chat";
                  if (isChat && nid) {
                    playCoalescedChatNotificationSound(`notif:${nid}`);
                  } else {
                    playNotificationSound();
                  }
                }
              }
            }
            onChangeRef.current();
          }
          ),
      });
      markRealtimeSignal = sub.markSignal;
      currentSub = sub;
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        currentSub?.stop();
        currentSub = null;
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        const uid = session?.user?.id;
        if (uid) subscribeForUser(uid);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      currentSub?.stop();
    };
  }, [enabled]);
}
