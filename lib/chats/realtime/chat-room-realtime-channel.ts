export type ChatRealtimeMode = "integrated" | "legacy" | "group";

export const CHAT_ROOM_MESSAGE_BUMP_EVENT = "message_bump";

export function chatRoomRealtimeTableForMode(
  mode: ChatRealtimeMode
): "chat_messages" | "group_messages" | "product_chat_messages" {
  return mode === "integrated" ? "chat_messages" : mode === "group" ? "group_messages" : "product_chat_messages";
}

export function chatRoomRealtimeChannelName(mode: ChatRealtimeMode, roomId: string): string {
  return `kasama-chat:${chatRoomRealtimeTableForMode(mode)}:${roomId.trim()}`;
}
