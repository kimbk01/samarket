"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { presentGroupReadReceipt } from "@/lib/community-messenger/group/group-room-read-presenter";
import { selectGroupReadCountMessageIds } from "@/lib/community-messenger/group/group-read-count-message-ids";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { onMessengerRealtimeResynced } from "@/lib/community-messenger/realtime/messenger-realtime-resync";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";

type GroupReadCounts = Record<string, ReturnType<typeof presentGroupReadReceipt>>;

const EMPTY_GROUP_READ_COUNTS: GroupReadCounts = {};

/** 여러 멤버가 거의 같이 읽으면(읽음 사건 연달아) 한 번으로 모은다 */
export const GROUP_READ_COUNTS_READ_EVENT_COALESCE_MS = 400;

/**
 * 그룹방 내 메시지 「읽은 수」 — 상태 아이콘(`resolveGroupReadFloorKey`)·길게 누름 메뉴 「읽음 N명」.
 *
 * 다시 조회하는 때 (2026-11-27 · 설계 docs/audit/supabase-request-surge-2026-11-18/messenger-refetch-amplification-2026-11-27.md §3):
 * - 방·내 메시지 id 가 바뀔 때(입장·내가 보냄)
 * - 이 방의 다른 멤버 읽음 사건(`cm-read-ack:<roomId>` → 버스 `cm.room.peer_read_ack`) — 서버가 읽음 위치가 실제로 바뀐 때만 보낸다
 * - 실시간 재연결 묶음(`onMessengerRealtimeResynced`) — 끊긴 동안 놓친 읽음
 * - `peerActivityKey` 가 바뀔 때 — 다른 멤버 새 메시지·멤버 수 변경. 보내는 사람의 읽음 위치는 보낼 때 DB 가 자기 메시지로 옮기고
 *   읽음 사건은 보내지 않으므로(`send_text` · mark_read 는 「같음·뒤로」면 사건 생략), 답장만 하고 읽음 사건이 없는 멤버도 반영한다.
 *
 * 이전: 방 상태 객체(`snapshot`)가 바뀔 때마다 다시 조회했다. 그룹방은 읽음 사건을 무시하고(`not_direct_room`)
 * 방 상태 교체에 기대어 갱신됐다 — 메시지 정합 조회·방 열기마다 상태 객체가 바뀌어, 운영 11-27 19:15~20:00 PHT
 * 메시지 22건에 이 조회 124번.
 */
export function useGroupMessageReadCounts(
  roomId: string,
  messageIds: string[],
  enabled: boolean = true,
  peerActivityKey: string = ""
) {
  const [counts, setCounts] = useState<GroupReadCounts>(EMPTY_GROUP_READ_COUNTS);
  const idsKey = useMemo(
    () => selectGroupReadCountMessageIds(messageIds, 50).join(","),
    [messageIds]
  );

  const inflightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const latestRef = useRef({ roomId, idsKey, enabled });
  latestRef.current = { roomId, idsKey, enabled };

  const fetchOnce = useCallback(async () => {
    const { roomId: rid, idsKey: key, enabled: on } = latestRef.current;
    const ids = key ? key.split(",") : [];
    if (!on || !rid.trim() || !ids.length) {
      setCounts((prev) => (prev === EMPTY_GROUP_READ_COUNTS ? prev : EMPTY_GROUP_READ_COUNTS));
      return;
    }
    try {
      const res = await fetch(`${communityMessengerGroupRoomApiPath(rid)}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        readCounts?: GroupReadCounts;
      };
      /** 응답이 오는 동안 방이 바뀌었으면 버린다 */
      if (latestRef.current.roomId !== rid) return;
      if (res.ok && json.ok && json.readCounts) setCounts(json.readCounts);
    } catch {
      /* 다음 사건에서 다시 */
    }
  }, []);

  /** 한 번에 하나 — 조회 중 들어온 요청은 끝난 뒤 1번 더 */
  const refresh = useCallback((): Promise<void> => {
    if (inflightRef.current) {
      rerunRef.current = true;
      return inflightRef.current;
    }
    const run = (async () => {
      do {
        rerunRef.current = false;
        await fetchOnce();
      } while (rerunRef.current);
    })().finally(() => {
      inflightRef.current = null;
    });
    inflightRef.current = run;
    return run;
  }, [fetchOnce]);

  /** 입장·내 메시지 id 변경 */
  useEffect(() => {
    void refresh();
  }, [roomId, idsKey, enabled, refresh]);

  /** 읽음 사건·재연결·다른 멤버 활동 — 가까운 것은 한 번으로 */
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useCallback(() => {
    if (coalesceTimerRef.current) return;
    coalesceTimerRef.current = setTimeout(() => {
      coalesceTimerRef.current = null;
      void refresh();
    }, GROUP_READ_COUNTS_READ_EVENT_COALESCE_MS);
  }, [refresh]);
  useEffect(
    () => () => {
      if (coalesceTimerRef.current) clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    },
    []
  );

  /** 다른 멤버 새 메시지·멤버 수 변경 — 처음 값은 입장 조회가 이미 받았다 */
  const lastPeerKeyRef = useRef<{ roomId: string; key: string } | null>(null);
  useEffect(() => {
    const prev = lastPeerKeyRef.current;
    lastPeerKeyRef.current = { roomId, key: peerActivityKey };
    if (!enabled || !prev || prev.roomId !== roomId || prev.key === peerActivityKey) return;
    schedule();
  }, [roomId, peerActivityKey, enabled, schedule]);

  /** 다른 멤버 읽음 사건·재연결 묶음 */
  useEffect(() => {
    if (!enabled) return;
    const ridNorm = normalizeMessengerRealtimeRoomId(roomId.trim());
    if (!ridNorm) return;
    const offBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.room.peer_read_ack") return;
      if (normalizeMessengerRealtimeRoomId(ev.roomId) !== ridNorm) return;
      schedule();
    });
    const offResync = onMessengerRealtimeResynced(() => schedule());
    return () => {
      offBus();
      offResync();
    };
  }, [roomId, enabled, schedule]);

  return { counts, refresh };
}
