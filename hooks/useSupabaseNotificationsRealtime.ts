"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  resolveNotificationSoundEventKeyFromRow,
  type NotificationSoundRowInput,
} from "@/lib/notifications/notification-sound-event-key-from-row";
import {
  playEventNotificationSound,
} from "@/lib/notifications/notification-sound-engine";
import { adaptNotificationEventInsertToLegacyRow } from "@/lib/notifications/adapt-notification-event-realtime-row";

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

function rowInputFromRecord(row: Record<string, unknown>): NotificationSoundRowInput {
  return {
    notification_type: typeof row.notification_type === "string" ? row.notification_type : null,
    domain: typeof row.domain === "string" ? row.domain : null,
    meta: row.meta,
    ref_id: typeof row.ref_id === "string" ? row.ref_id : null,
  };
}

function playRowEventSound(row: Record<string, unknown>): void {
  const eventKey = resolveNotificationSoundEventKeyFromRow(rowInputFromRecord(row));
  if (eventKey) {
    void playEventNotificationSound(eventKey);
  }
  /** CONTRACT: eventKey 없는 채팅/행은 system_default 위장 재생 금지 */
}

/**
 * Supabase 세션이 있을 때 `public.notifications` + `notification_events` INSERT/UPDATE마다 onChange 호출.
 * 앱당 채널 1개(`notifications-rt:${userId}`) — 복수 구독 시 Realtime·워커 부하만 증가.
 */
export function useSupabaseNotificationsRealtime(
  onChange: (ctx: { eventType: string }) => void,
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

      const handleRealtimePayload = (payload: unknown) => {
        markRealtimeSignal();
        const ev = payload as { eventType?: string; new?: Record<string, unknown> };
        const eventType = typeof ev.eventType === "string" ? ev.eventType : "UNKNOWN";
        if (eventType === "INSERT" && ev.new && typeof ev.new === "object") {
          // P4: friend-request popup path removed — notification row only triggers list refresh/sound.
        }
        if (playSoundOnInsertRef.current && shouldPlaySoundForNotificationInsert(payload)) {
          const row = (payload as { new?: Record<string, unknown> }).new ?? {};
          const onInsertSound = onInsertSoundRef.current;
          if (onInsertSound) {
            const r = onInsertSound(row);
            if (r === false) {
              onChangeRef.current({ eventType });
              return;
            }
            if (r === true) {
              onChangeRef.current({ eventType });
              return;
            }
          }
          const eventKey = resolveNotificationSoundEventKeyFromRow(rowInputFromRecord(row));
          if (eventKey) {
            playRowEventSound(row);
          } else if (row?.notification_type === "chat") {
            /**
             * CONTRACT: 채팅 INSERT 에 eventKey 가 없으면 system_default 로 위장 재생하지 않음.
             */
          } else {
            playRowEventSound(row);
          }
        }
        onChangeRef.current({ eventType });
      };

      const sub = subscribeWithRetry({
        sb,
        name: `notifications-rt:${uid}`,
        scope: `notifications-rt:${uid}`,
        isCancelled: () => cancelled,
        silentAfterMs: 18_000,
        build: (channel) =>
          channel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "notifications",
                filter: `user_id=eq.${uid}`,
              },
              handleRealtimePayload
            )
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "notification_events",
                filter: `user_id=eq.${uid}`,
              },
              (payload) => {
                const ev = payload as { eventType?: string; new?: Record<string, unknown> };
                if (ev.eventType !== "INSERT" || !ev.new || typeof ev.new !== "object") return;
                handleRealtimePayload({
                  eventType: "INSERT",
                  new: adaptNotificationEventInsertToLegacyRow(ev.new as Record<string, unknown>),
                });
              }
            ),
      });
      markRealtimeSignal = sub.markSignal;
      currentSub = sub;
    };

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const uid = session?.user?.id?.trim();
      if (uid) subscribeForUser(uid);
    });

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
