import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";

/**
 * 1:1 통화는 전체 이력을 유지하고, 그룹 통화는 room 당 최신 1건만 표시한다.
 */
export function mergeCallHistoryForHomeList(calls: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  const sorted = sortCallHistoryEntries(calls);
  const seenGroupRooms = new Set<string>();
  const out: CommunityMessengerCallLog[] = [];

  for (const call of sorted) {
    if (call.sessionMode === "group") {
      const roomId = call.roomId?.trim();
      if (!roomId) {
        out.push(call);
        continue;
      }
      const key = `room:${roomId}`;
      if (seenGroupRooms.has(key)) continue;
      seenGroupRooms.add(key);
      out.push(call);
      continue;
    }
    out.push(call);
  }

  return out;
}
