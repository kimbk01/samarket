"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { presentGroupReadReceipt } from "@/lib/community-messenger/group/group-room-read-presenter";

type GroupReadCounts = Record<string, ReturnType<typeof presentGroupReadReceipt>>;

const EMPTY_GROUP_READ_COUNTS: GroupReadCounts = {};

/**
 * 채팅 P0-1 (Owner 「채팅 P0 승인」 2026-11-11): 조회 대상은 메시지 id **내용**으로만 바뀐다.
 * 예전에는 메시지 배열이 바뀔 때마다(내용이 같아도) 다시 조회하고, 대상이 없으면 매번 새 `{}` 를 넣어
 * 1:1 방에서도 타임라인 전체가 한 번 더 그려졌다(실측: 진입 중 반복).
 * `refreshSignal`: 방 상태(snapshot)가 새로 오면 다시 조회 — 다른 멤버가 읽은 수 갱신은 예전에도 이 시점(방 새로고침)에 일어났다.
 */
export function useGroupMessageReadCounts(roomId: string, messageIds: string[], refreshSignal?: unknown) {
  const [counts, setCounts] = useState<GroupReadCounts>(EMPTY_GROUP_READ_COUNTS);
  const idsKey = useMemo(
    () => [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50).join(","),
    [messageIds]
  );

  const refresh = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (!roomId.trim() || !ids.length) {
      setCounts((prev) => (prev === EMPTY_GROUP_READ_COUNTS ? prev : EMPTY_GROUP_READ_COUNTS));
      return;
    }
    const res = await fetch(`${communityMessengerGroupRoomApiPath(roomId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds: ids }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      readCounts?: GroupReadCounts;
    };
    if (res.ok && json.ok && json.readCounts) setCounts(json.readCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSignal 은 다시 조회 시점 신호
  }, [idsKey, roomId, refreshSignal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { counts, refresh };
}
