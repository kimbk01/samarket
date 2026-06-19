import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";
import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";

/** `messenger-realtime-store.normalizeRoomId` 와 동일 — 스토어 모듈 의존 없이 목록 병합만 유지 */
function normCmRoomId(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

function sameMessengerListRoomId(a: string, b: string): boolean {
  return normCmRoomId(a) === normCmRoomId(b);
}

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

function roomSummaryShallowEqual(a: CommunityMessengerRoomSummary, b: CommunityMessengerRoomSummary): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as Array<keyof CommunityMessengerRoomSummary>;
  const bKeys = Object.keys(b) as Array<keyof CommunityMessengerRoomSummary>;
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (a[k] !== b[k]) return false;
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
  const isGroup = isCommunityMessengerPrivateGroupListRoomType(summary.roomType);
  const targetKey = isGroup ? "groups" : "chats";
  const otherKey = isGroup ? "chats" : "groups";
  const target0 = data[targetKey] ?? [];
  const sameIndex = target0.findIndex((r) => sameMessengerListRoomId(r.id, summary.id));
  const existsInOther = (data[otherKey] ?? []).some((r) => sameMessengerListRoomId(r.id, summary.id));
  if (!existsInOther && sameIndex >= 0) {
    const same = target0[sameIndex]!;
    const prev = sameIndex > 0 ? target0[sameIndex - 1] : null;
    const next = sameIndex + 1 < target0.length ? target0[sameIndex + 1] : null;
    const ts = String(summary.lastMessageAt ?? "");
    const inOrder =
      (!prev || String(prev.lastMessageAt ?? "").localeCompare(ts) >= 0) &&
      (!next || ts.localeCompare(String(next.lastMessageAt ?? "")) >= 0);
    if (inOrder && roomSummaryShallowEqual(same, summary)) {
      return data;
    }
  }
  const other = (data[otherKey] ?? []).filter((r) => !sameMessengerListRoomId(r.id, summary.id));
  const target = (data[targetKey] ?? []).filter((r) => !sameMessengerListRoomId(r.id, summary.id));
  const prevRow =
    (data[targetKey] ?? []).find((r) => sameMessengerListRoomId(r.id, summary.id)) ??
    (data[otherKey] ?? []).find((r) => sameMessengerListRoomId(r.id, summary.id));
  const summaryMerged = prevRow
    ? coalesceRoomSummarySnapshotRow(prevRow, summary, {
        surface: "room_list",
        roomId: summary.id,
        source: "merge_room_summary",
        eventType: "merge_room_summary",
      })
    : summary;
  let mergedTarget: CommunityMessengerRoomSummary[];
  if (isBucketSortedDescByLastMessageAt(target)) {
    mergedTarget = mergeSummaryIntoDescSortedBucket(target, summaryMerged);
  } else {
    bumpMessengerRenderPerf("messenger_room_list_sort");
    mergedTarget = [...target, summaryMerged].sort((a, b) => compareLastMessageAtDesc(a, b));
  }
  return {
    ...data,
    [otherKey]: other,
    [targetKey]: mergedTarget,
  };
}
