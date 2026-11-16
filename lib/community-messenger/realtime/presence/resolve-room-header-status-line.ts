import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";

/**
 * 방 머리글 부제(상태 줄).
 * - 그룹: 입력 중 → 그 외 방 상태 문구(지금과 같음).
 * - 1:1: 입력 중 → 접속 상태(「온라인」·「자리 비움」·「마지막 접속 …」·「오프라인」).
 *   상대가 있는데 접속 상태가 아직 없으면(첫 조회 응답 전) **빈칸** — 방 설명 문구를 상태 자리에 쓰지 않는다
 *   (2026-11-16 감사 F3: 「1:1 대화 · 친구와 1:1로 대화하는 채팅방」이 상태처럼 나옴).
 *   상대 id 를 모르는 방만 지금처럼 방 상태 문구.
 * @see docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md
 */
export function resolveMessengerRoomHeaderStatusLine(args: {
  roomType: string;
  typingPeerCount: number;
  peerUserId: string | null | undefined;
  peerPresence: CommunityMessengerPeerPresenceSnapshot | null;
  roomHeaderStatus: string;
  t: (key: "cm_ui_typing_multiple" | "chats_peer_typing", vars?: { count: number }) => string;
}): string {
  if (args.roomType !== "direct") {
    if (args.typingPeerCount >= 2) return args.t("cm_ui_typing_multiple", { count: args.typingPeerCount });
    if (args.typingPeerCount === 1) return args.t("chats_peer_typing");
    return args.roomHeaderStatus;
  }
  if (args.typingPeerCount > 0) return args.t("chats_peer_typing");
  if (args.peerPresence) return formatMessengerPeerPresenceLine(args.peerPresence);
  if (args.peerUserId?.trim()) return "";
  return args.roomHeaderStatus;
}
