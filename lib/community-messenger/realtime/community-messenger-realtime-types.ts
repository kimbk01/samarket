export type CommunityMessengerHomeRealtimeMessageInsertHint = {
  roomId: string;
  newRecord: Record<string, unknown>;
};

export type CommunityMessengerRoomRealtimeMessageRow = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CommunityMessengerRoomRealtimeMessageEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  message: CommunityMessengerRoomRealtimeMessageRow;
};
