"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

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
 * 거래·매장 주문 등 **통합 `chat_rooms`** 방 목록: `chat_messages` 변경만으로도
 * `last_message` 가 rooms 행보다 먼저 반영되는 경우 목록이 따라가도록 한다.
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
    if (!args.enabled || !args.userId?.trim() || !fp) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channels: RealtimeChannel[] = [];

    const scheduleStale = () => {
      if (debounceTimer != null) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) onStaleRef.current();
      }, LIST_STALE_DEBOUNCE_MS);
    };

    const roomIds = fp.split("\0").filter(Boolean);
    for (let offset = 0; offset < roomIds.length; offset += INTEGRATED_CHAT_LIST_IN_FILTER_MAX) {
      const chunk = roomIds.slice(offset, offset + INTEGRATED_CHAT_LIST_IN_FILTER_MAX);
      const filter = `room_id=in.(${chunk.join(",")})`;
      const ch = sb
        .channel(`integrated-chat-list:msgs:${args.userId.trim()}:${offset}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_messages", filter },
          () => {
            if (!cancelled) scheduleStale();
          }
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      cancelled = true;
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const ch of channels) {
        void sb.removeChannel(ch);
      }
    };
  }, [args.enabled, args.userId, fp, onStaleRef]);
}
