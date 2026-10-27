"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  notificationSoundRowInputFromRecord,
  resolveNotificationSoundEventKeyFromRow,
} from "@/lib/notifications/notification-sound-event-key-from-row";
import { ingestNotificationEventRowSound } from "@/lib/notifications/notification-sound-decision";
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

/**
 * D-5 (재감사 P-6): 읽음·삭제로 바뀐 notification_events UPDATE 인지.
 * 같은 행의 push_handoff_* 갱신(아직 미읽음·미삭제) UPDATE 는 배지와 무관하므로 걸러낸다.
 */
export function isNotificationEventReadOrDismissUpdate(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const readAt = typeof row.read_at === "string" ? row.read_at.trim() : "";
  if (row.unread === false || readAt) return true;
  const payload =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  const deletedAt = typeof payload?.deleted_at === "string" ? payload.deleted_at.trim() : "";
  const dismissedAt =
    typeof payload?.inbox_dismissed_at === "string" ? payload.inbox_dismissed_at.trim() : "";
  return Boolean(deletedAt || dismissedAt || payload?.deleted === true);
}

function shouldPlaySoundForNotificationInsert(payload: unknown): boolean {
  if (!isInsertEvent(payload)) return false;
  return true;
}

const rowInputFromRecord = notificationSoundRowInputFromRecord;

function playRowEventSound(row: Record<string, unknown>): void {
  const eventKey = resolveNotificationSoundEventKeyFromRow(rowInputFromRecord(row));
  if (!eventKey && row?.notification_type === "chat") return;
  ingestNotificationEventRowSound(row);
}

/**
 * Supabase 세션이 있을 때 `public.notifications` 변경 + `notification_events` INSERT·읽음/삭제 UPDATE 마다 onChange 호출.
 * 채널 재연결(SUBSCRIBED 2회째부터)에는 `RESYNC` 로 1회 알린다.
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
      /** D-5: 첫 SUBSCRIBED 는 앱 부팅 조회가 맡고, 재연결 SUBSCRIBED 에서만 끊긴 동안 놓친 변경을 1회 따라잡는다. */
      let subscribedOnce = false;

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
        channelOptions: messengerPrivateBroadcastChannelOptions(),
        isCancelled: () => cancelled,
        silentAfterMs: 18_000,
        onStatus: (status) => {
          if (status !== "SUBSCRIBED") return;
          if (subscribedOnce) onChangeRef.current({ eventType: "RESYNC" });
          subscribedOnce = true;
        },
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
            )
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "notification_events",
                filter: `user_id=eq.${uid}`,
              },
              (payload) => {
                // D-5: 다른 기기·탭의 읽음·삭제 — 알림음 없이 목록·배지만 다시 받는다.
                const ev = payload as { eventType?: string; new?: Record<string, unknown> };
                if (ev.eventType !== "UPDATE" || !isNotificationEventReadOrDismissUpdate(ev.new)) return;
                markRealtimeSignal();
                onChangeRef.current({ eventType: "UPDATE" });
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
