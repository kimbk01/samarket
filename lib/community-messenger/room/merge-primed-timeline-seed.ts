import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { getMessengerRealtimeRoomMessages } from "@/lib/community-messenger/stores/messenger-realtime-store";

/**
 * Stale bootstrap / cache seed must never drop confirmed rows already in React or the realtime store.
 * Empty `prev` (remount) still unions store messages before applying the seed window.
 */
export function mergePrimedTimelineSeedIntoExisting(args: {
  roomId: string;
  prev: Array<CommunityMessengerMessage & { pending?: boolean }>;
  seed: CommunityMessengerMessage[];
}): Array<CommunityMessengerMessage & { pending?: boolean }> {
  const rid = args.roomId.trim();
  const storeMsgs = rid ? getMessengerRealtimeRoomMessages(rid) : [];
  const base = mergeRoomMessages(storeMsgs, args.prev);
  if (args.seed.length === 0) return base;
  return mergeRoomMessages(base, args.seed);
}
