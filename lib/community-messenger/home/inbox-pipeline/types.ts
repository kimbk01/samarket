import type {
  CommunityMessengerMessageType,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";

export type CanonicalMessengerHomeRoom = {
  roomId: string;
  roomType: CommunityMessengerRoomType;
  directKey: string | null;
  contextMeta: CommunityMessengerRoomContextMetaV1 | null;

  title: string;
  avatarUrl: string | null;

  latestMessage: string;
  latestMessageType?: CommunityMessengerMessageType;
  lastMessageAt: string;

  unreadCount: number;

  isArchived: boolean;
  isBlockedHidden: boolean;
  roomStatus: CommunityMessengerRoomStatus;

  memberCount: number;
};

export type CanonicalMessengerHomeRoomPatch = {
  roomId: string;

  roomType?: CommunityMessengerRoomType;
  directKey?: string | null;
  contextMeta?: CommunityMessengerRoomContextMetaV1 | null;

  title?: string;
  avatarUrl?: string | null;

  latestMessage?: string;
  latestMessageType?: CommunityMessengerMessageType;
  lastMessageAt?: string;

  unreadCount?: number;

  isArchived?: boolean;
  isBlockedHidden?: boolean;
  roomStatus?: CommunityMessengerRoomStatus;

  memberCount?: number;
};

export type MessengerHomeSource =
  | "critical"
  | "lite"
  | "full"
  | "cache"
  | "home_sync"
  | "realtime"
  | "trade_meta"
  | "delivery_meta"
  | "participant"
  | "multi_tab";

export type MessengerHomeRoomUpsertEvent = {
  kind?: "upsert";
  source: MessengerHomeSource;
  generation: number;
  roomId: string;
  patch: CanonicalMessengerHomeRoomPatch;
};

export type MessengerHomeRoomRemoveReason = "leave" | "deleted" | "membership_removed";

export type MessengerHomeRoomRemoveEvent = {
  kind: "remove";
  source: MessengerHomeSource;
  generation: number;
  roomId: string;
  reason: MessengerHomeRoomRemoveReason;
};

export type MessengerHomeRoomEvent = MessengerHomeRoomUpsertEvent | MessengerHomeRoomRemoveEvent;

export type MessengerHomeCanonicalState = {
  rooms: Map<string, CanonicalMessengerHomeRoom>;
  lastGenerationByRoomSource: Map<string, number>;
  /** New-room patches are parked here until required identity/display fields arrive. */
  pendingPatches: Map<string, CanonicalMessengerHomeRoomPatch>;
};

export type MessengerHomeBucket = "trade" | "delivery" | "direct" | "group" | "excluded";

export type MessengerHomeProjection = {
  tradeRoomIds: string[];
  deliveryRoomIds: string[];
  inboxRoomIds: string[];
  bucketByRoomId: Map<string, MessengerHomeBucket>;
  unreadByRoomId: Map<string, number>;
};
