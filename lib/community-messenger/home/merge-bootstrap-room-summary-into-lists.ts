import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";

/**
 * 홈 부트스트랩 `chats` / `groups` 에 단일 방 요약을 넣거나 동일 id 를 교체한다.
 * 잘못된 버킷에 있던 동일 id 행은 제거한다(방 타입 변경 등 희귀 케이스).
 */
export function mergeBootstrapRoomSummaryIntoLists(
  data: CommunityMessengerBootstrap,
  summary: CommunityMessengerRoomSummary
): CommunityMessengerBootstrap {
  const isGroup = isCommunityMessengerGroupRoomType(summary.roomType);
  const targetKey = isGroup ? "groups" : "chats";
  const otherKey = isGroup ? "chats" : "groups";
  const other = (data[otherKey] ?? []).filter((r) => r.id !== summary.id);
  const target = (data[targetKey] ?? []).filter((r) => r.id !== summary.id);
  const mergedTarget = [...target, summary].sort((a, b) =>
    String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))
  );
  return {
    ...data,
    [otherKey]: other,
    [targetKey]: mergedTarget,
  };
}
