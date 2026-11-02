import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { getMessengerRealtimeRoomMessages } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { filterMessagesByHistoryFloor } from "@/lib/community-messenger/room/message-history-floor";

/**
 * Stale bootstrap / cache seed must never drop confirmed rows already in React or the realtime store.
 * Empty `prev` (remount) still unions store messages before applying the seed window.
 * S-2 H: 단, 서버가 준 내 기록 하한(`historyFloorAt`) 이하 행은 합친 뒤 버린다 — 나가기 전 대화가 다시 섞이지 않게.
 */
export function mergePrimedTimelineSeedIntoExisting(args: {
  roomId: string;
  prev: Array<CommunityMessengerMessage & { pending?: boolean }>;
  seed: CommunityMessengerMessage[];
  historyFloorAt?: string | null;
}): Array<CommunityMessengerMessage & { pending?: boolean }> {
  const rid = args.roomId.trim();
  const storeMsgs = rid ? getMessengerRealtimeRoomMessages(rid) : [];
  const base = mergeRoomMessages(storeMsgs, args.prev);
  const merged = args.seed.length === 0 ? base : mergeRoomMessages(base, args.seed);
  return filterMessagesByHistoryFloor(merged, args.historyFloorAt);
}
