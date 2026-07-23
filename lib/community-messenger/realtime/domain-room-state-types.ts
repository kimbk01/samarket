/**
 * Phase R — Domain Room State (Realtime Spine SSOT).
 * List preview/order/unread and Projection Inputs share this state.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type DomainRoomListState = Readonly<{
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  previewText: string;
  lastMessageAt: string;
  lastMessageType: string;
  unreadCount: number;
  title?: string;
}>;

export type DomainRoomStateSnapshot = Readonly<{
  viewerUserId: string | null;
  /** roomId (normalized lower) → state */
  rooms: ReadonlyMap<string, DomainRoomListState>;
  generation: number;
}>;

export type DomainRoomMessageEvent = Readonly<{
  type: "message";
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  messageId: string;
  previewText: string;
  lastMessageAt: string;
  lastMessageType: string;
  /** true when viewer is not the sender — unread++ */
  boostUnread: boolean;
  title?: string;
}>;

export type DomainRoomReadEvent = Readonly<{
  type: "read";
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentityKey: string;
}>;

export type DomainRoomSnapshotEvent = Readonly<{
  type: "snapshot";
  rooms: ReadonlyArray<DomainRoomListState>;
  /** replace|merge — bootstrap replace, recovery merge */
  mode: "replace" | "merge";
}>;

export type DomainRoomEvent =
  | DomainRoomMessageEvent
  | DomainRoomReadEvent
  | DomainRoomSnapshotEvent;

export type DomainUnreadRoomCounts = Readonly<{
  general_direct: number;
  group: number;
  trade: number;
  store_order: number;
}>;

export function emptyDomainUnreadRoomCounts(): DomainUnreadRoomCounts {
  return { general_direct: 0, group: 0, trade: 0, store_order: 0 };
}

export function normalizeDomainRoomId(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}
