export type CommunityMessengerHomeRealtimeMessageInsertHint = {
  roomId: string;
  newRecord: Record<string, unknown>;
};

/** messages UPDATE — tip preview 의미 변경만 (normalize 이후) */
export type CommunityMessengerHomeRealtimeMessageUpdateHint = {
  roomId: string;
  newRecord: Record<string, unknown>;
  oldRecord?: Record<string, unknown> | null;
};

/** rooms tip UPDATE — last_message / last_message_at / last_message_type 실변경만 */
export type CommunityMessengerHomeRealtimeRoomTipUpdateHint = {
  roomId: string;
  tip: {
    lastMessage: string;
    lastMessageType: string;
    lastMessageAt: string;
  };
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
  messageType:
    | "text"
    | "image"
    | "file"
    | "system"
    | "call_stub"
    | "voice"
    | "sticker"
    | "community_post_share"
    | "gift_certificate";
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
