export type CommunityMessengerHomeRealtimeMessageInsertHint = {
  roomId: string;
  newRecord: Record<string, unknown>;
};

export type CommunityMessengerHomeRealtimeParticipantUnreadHint = {
  roomId: string;
  unreadCount: number;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
};

export type CommunityMessengerRoomRealtimeMessageRow = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  replyToMessageId?: string | null;
  replyPreviewText?: string | null;
  replyPreviewType?: string | null;
  replySenderLabelSnapshot?: string | null;
  deletedForEveryoneAt?: string | null;
};

export type CommunityMessengerRoomRealtimeMessageEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  message: CommunityMessengerRoomRealtimeMessageRow;
};
