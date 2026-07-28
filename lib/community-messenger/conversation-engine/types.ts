/**
 * Conversation list engine — summary + event model.
 * Sole product list writer after cutover: applyConversationEvent → ConversationStore.
 * @see docs/community-messenger/conversation-engine-legacy-inventory.md
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ConversationDomain = ChatDomain;

export type ConversationPreviewKind =
  | "text"
  | "image"
  | "file"
  | "system"
  | "call"
  | "voice"
  | "sticker"
  | "community_post_share";

export type ConversationCallStatus =
  | "dialing"
  | "ringing"
  | "ended"
  | "cancelled"
  | "rejected"
  | "missed"
  | "busy"
  | "failed"
  | "peer_busy"
  | string;

export type ConversationPreview = Readonly<{
  kind: ConversationPreviewKind;
  text: string;
  /** Message id when tip is message-backed; call session/call id for call tips. */
  messageId?: string | null;
  callStatus?: ConversationCallStatus | null;
  callId?: string | null;
  sessionId?: string | null;
}>;

export type ConversationSummary = Readonly<{
  conversationId: string;
  roomId: string;
  domain: ConversationDomain;
  domainIdentityKey: string | null;
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchivedByViewer: boolean;
  isBlockedHiddenByViewer: boolean;
  lastActivityAt: string;
  preview: ConversationPreview;
  /** Monotonic tip revision (ms from lastActivityAt or server revision). */
  revision: number;
  roomType: string;
  roomStatus: string;
  peerUserId: string | null;
  messengerDirectKey: string | null;
}>;

export type ConversationUpsertEvent = Readonly<{
  type: "conversation_upsert";
  eventId: string;
  conversationId: string;
  roomId: string;
  domain: ConversationDomain;
  lastActivityAt: string;
  revision: number;
  preview: ConversationPreview;
  unreadCount?: number;
  title?: string;
  subtitle?: string;
  avatarUrl?: string | null;
  isMuted?: boolean;
  isPinned?: boolean;
  isArchivedByViewer?: boolean;
  isBlockedHiddenByViewer?: boolean;
  domainIdentityKey?: string | null;
  roomType?: string;
  roomStatus?: string;
  peerUserId?: string | null;
  messengerDirectKey?: string | null;
}>;

export type ConversationReadEvent = Readonly<{
  type: "conversation_read";
  eventId: string;
  conversationId: string;
  roomId: string;
  domain: ConversationDomain;
  unreadCount: number;
  revision?: number;
}>;

export type ConversationRemoveEvent = Readonly<{
  type: "conversation_remove";
  eventId: string;
  conversationId: string;
  roomId: string;
  domain: ConversationDomain;
}>;

export type ConversationEvent =
  | ConversationUpsertEvent
  | ConversationReadEvent
  | ConversationRemoveEvent;

export type ConversationEngineMetrics = Readonly<{
  eventsApplied: number;
  eventsDropped: number;
  conversationsMutated: number;
  arrayReplaces: number;
}>;
