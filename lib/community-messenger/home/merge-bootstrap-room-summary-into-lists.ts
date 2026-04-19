import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";

/** `merge` 가 쓰던 `lastMessageAt` 내림차순 비교와 동일 */
function compareLastMessageAtDesc(a: CommunityMessengerRoomSummary, b: CommunityMessengerRoomSummary): number {
  return String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? ""));
}

function isBucketSortedDescByLastMessageAt(rooms: CommunityMessengerRoomSummary[]): boolean {
  for (let i = 1; i < rooms.length; i++) {
    if (compareLastMessageAtDesc(rooms[i - 1], rooms[i]) > 0) return false;
  }
  return true;
}

/** `rooms` 는 이미 `summary.id` 가 제거된 상태 */
function mergeSummaryIntoDescSortedBucket(
  rooms: CommunityMessengerRoomSummary[],
  summary: CommunityMessengerRoomSummary
): CommunityMessengerRoomSummary[] {
  const s = String(summary.lastMessageAt ?? "");
  let j = 0;
  while (j < rooms.length) {
    const roomVsSummary = String(rooms[j].lastMessageAt ?? "").localeCompare(s);
    if (roomVsSummary > 0) {
      j++;
      continue;
    }
    break;
  }
  if (j === 0) return [summary, ...rooms];
  if (j === rooms.length) return [...rooms, summary];
  return [...rooms.slice(0, j), summary, ...rooms.slice(j)];
}

/**
 * 홈 부트스트랩 `chats` / `groups` 에 단일 방 요약을 넣거나 동일 id 를 교체한다.
 * 잘못된 버킷에 있던 동일 id 행은 제거한다(방 타입 변경 등 희귀 케이스).
 */
export function mergeBootstrapRoomSummaryIntoLists(
  data: CommunityMessengerBootstrap,
  summary: CommunityMessengerRoomSummary
): CommunityMessengerBootstrap {
  bumpMessengerRenderPerf("messenger_room_summary_merge");
  const isGroup = isCommunityMessengerGroupRoomType(summary.roomType);
  const targetKey = isGroup ? "groups" : "chats";
  const otherKey = isGroup ? "chats" : "groups";
  const other = (data[otherKey] ?? []).filter((r) => r.id !== summary.id);
  const target = (data[targetKey] ?? []).filter((r) => r.id !== summary.id);
  let mergedTarget: CommunityMessengerRoomSummary[];
  if (isBucketSortedDescByLastMessageAt(target)) {
    mergedTarget = mergeSummaryIntoDescSortedBucket(target, summary);
  } else {
    bumpMessengerRenderPerf("messenger_room_list_sort");
    mergedTarget = [...target, summary].sort((a, b) => compareLastMessageAtDesc(a, b));
  }
  return {
    ...data,
    [otherKey]: other,
    [targetKey]: mergedTarget,
  };
}
