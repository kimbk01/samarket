/**
 * 알림 센터 목록 모델 — 시트 UI와 `CommunityMessengerHome` 의 알림 집계가 공유.
 * (시트 번들에서 분리해 메신저 홈 초기 청크 경량화)
 */
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerFriendRequest,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type MessengerNotificationCenterItem =
  | {
      id: string;
      kind: "request";
      createdAt: string;
      request: CommunityMessengerFriendRequest;
    }
  | {
      id: string;
      kind: "missed_call";
      createdAt: string;
      call: CommunityMessengerCallLog;
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
