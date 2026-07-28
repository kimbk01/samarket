import { mapRoomSummariesToConversations } from "@/lib/community-messenger/conversation-engine/mapper-from-room-summary";
import { getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** One-shot / replace seed from hub bootstrap chats+groups. */
export function seedConversationStoreFromBootstrap(
  data: Pick<CommunityMessengerBootstrap, "chats" | "groups"> | null | undefined
): void {
  if (!data) return;
  const rooms: CommunityMessengerRoomSummary[] = [...(data.chats ?? []), ...(data.groups ?? [])];
  getConversationStore().seedFromRoomSummaries(rooms);
}

export function seedConversationStoreFromRooms(rooms: readonly CommunityMessengerRoomSummary[]): void {
  getConversationStore().seedConversations(mapRoomSummariesToConversations(rooms));
}
