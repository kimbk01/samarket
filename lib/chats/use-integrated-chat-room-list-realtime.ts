"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";

/** Supabase `in` 필터 한도에 맞춤 — 커뮤니티 메신저 홈 청크와 동일 여유 */
const INTEGRATED_CHAT_LIST_IN_FILTER_MAX = 90;
/** 목록 GET 합류 — Realtime 버스트 시 폭주 완화 */
const LIST_STALE_DEBOUNCE_MS = 380;

function useStableCallback(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}

/**
 * 거래·매장 주문 등 **통합 `chat_rooms`** 방 목록:
 * - `chat_messages` — 미리보기가 rooms 행보다 먼저 반영되는 경우
 * - `chat_rooms` UPDATE — `trade_status` 등(자동 문의중/판매중 동기화)으로 목록 배지가 바뀔 때
 *
 * (참가자 RLS: `chat_messages_select_room_participant` — `20260331240000_…`)
 */
export function useIntegratedChatRoomListRealtime(args: {
  userId: string | null;
  integratedRoomIds: string[];
  enabled: boolean;
  onListStale: () => void;
}): void {
  const onStaleRef = useStableCallback(args.onListStale);
  const fp = [...new Set(args.integratedRoomIds.map((x) => String(x).trim()).filter(Boolean))].sort().join("\0");

  useEffect(() => {
    const userId = args.userId?.trim();
    if (!args.enabled || !userId || !fp) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    /** `waitFor` 이후 비동기로 채워짐 — cleanup 이 빈 배열로 끝나는 레이스 방지 */
    const mountedChannels: RealtimeChannel[] = [];

    const scheduleStale = () => {
      if (debounceTimer != null) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) onStaleRef.current();
      }, LIST_STALE_DEBOUNCE_MS);
    };

    void (async () => {
      await waitForSupabaseRealtimeAuth(sb);
      if (cancelled) return;
      /**
       * 신규 거래방 생성 시 기존 구현은 "이미 알고 있는 room_id" 구독만 있어서
       * seller 측 목록이 다음 폴링 전까지 갱신되지 않을 수 있었다.
       * 참가자 행(내 user_id) INSERT/UPDATE를 함께 구독해 신규 방 유입도 즉시 stale 처리한다.
       */
      const chParticipants = sb
        .channel(`integrated-chat-list:participants:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_room_participants",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (!cancelled) scheduleStale();
          }
        )
        .subscribe();
      mountedChannels.push(chParticipants);

      const roomIds = fp.split("\0").filter(Boolean);
      for (let offset = 0; offset < roomIds.length; offset += INTEGRATED_CHAT_LIST_IN_FILTER_MAX) {
        if (cancelled) break;
        const chunk = roomIds.slice(offset, offset + INTEGRATED_CHAT_LIST_IN_FILTER_MAX);
        const filter = `room_id=in.(${chunk.join(",")})`;
        const chMsg = sb
          .channel(`integrated-chat-list:msgs:${userId}:${offset}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chat_messages", filter },
            () => {
              if (!cancelled) scheduleStale();
            }
          )
          .subscribe();
        mountedChannels.push(chMsg);

        const roomFilter = `id=in.(${chunk.join(",")})`;
        const chRoom = sb
          .channel(`integrated-chat-list:rooms:${userId}:${offset}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "chat_rooms", filter: roomFilter },
            () => {
              if (!cancelled) scheduleStale();
            }
          )
          .subscribe();
        mountedChannels.push(chRoom);
      }
    })();

    return () => {
      cancelled = true;
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const ch of mountedChannels) {
        void sb.removeChannel(ch);
      }
      mountedChannels.length = 0;
    };
  }, [args.enabled, args.userId, fp, onStaleRef]);
}
