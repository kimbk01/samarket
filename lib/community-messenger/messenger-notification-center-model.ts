/**
 * 알림 센터 목록 모델 — 시트 UI와 `CommunityMessengerHome` 의 알림 집계가 공유.
 */
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { IncomingGroupInvitePopupEntry } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

export type MessengerNotificationCenterItem =
  | {
      id: string;
      kind: "missed_call";
      createdAt: string;
      call: CommunityMessengerCallLog;
    }
  | {
      id: string;
      kind: "group_invite";
      createdAt: string;
      invite: IncomingGroupInvitePopupEntry;
    }
  | {
      id: string;
      kind: "important_room";
      createdAt: string;
      room: CommunityMessengerRoomSummary;
      preview: string;
      highlightReason: "pinned" | "trade" | "delivery";
    };

export function resolveImportantRoomHighlightReason(
  room: CommunityMessengerRoomSummary
): "pinned" | "trade" | "delivery" {
  if (room.isPinned) return "pinned";
  if (communityMessengerRoomIsTrade(room)) return "trade";
  return "delivery";
}
