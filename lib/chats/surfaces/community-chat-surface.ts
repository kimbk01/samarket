/**
 * 커뮤니티 채팅 표면 — 문구·경로만 이 파일에서 관리.
 */

export const COMMUNITY_CHAT_SURFACE = {
  id: "community",
  hubTabLabel: "커뮤니티",
  hubPath: "/community",
  /**
   * 거래 허브 목록에 섞인 일반방 `generalChat.kind === "community"` 뱃지.
   * 탭 라벨과 다르게 두려면 이 값만 수정.
   */
  tradeListRoomBadgeLabel: "커뮤니티",
} as const;

export type CommunityChatSurface = typeof COMMUNITY_CHAT_SURFACE;
