"use client";

import { useCallback, useEffect, useState } from "react";
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { presentGroupReadReceipt } from "@/lib/community-messenger/group/group-room-read-presenter";

export function useGroupMessageReadCounts(roomId: string, messageIds: string[]) {
  const [counts, setCounts] = useState<Record<string, ReturnType<typeof presentGroupReadReceipt>>>({});

  const refresh = useCallback(async () => {
    const ids = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
    if (!roomId.trim() || !ids.length) {
      setCounts({});
      return;
    }
    const res = await fetch(`${communityMessengerGroupRoomApiPath(roomId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds: ids }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      readCounts?: Record<string, ReturnType<typeof presentGroupReadReceipt>>;
    };
    if (res.ok && json.ok && json.readCounts) setCounts(json.readCounts);
  }, [messageIds, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { counts, refresh };
}
