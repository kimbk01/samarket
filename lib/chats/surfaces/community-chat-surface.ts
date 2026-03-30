/**
 * 커뮤니티·일반 DM 표면 — 문구·경로·API `segment=philife` 단일 출처.
 * 커뮤니티 피드(`/philife`)와 채팅 목록(`/chats/philife`)은 분리; 아래 링크로 연동.
 */

export const COMMUNITY_CHAT_SURFACE = {
  id: "philife",
  hubTabLabel: "커뮤니티 채팅",
  /** 채팅 허브 2탭 — 일반·커뮤니티 DM 전용 목록 */
  hubPath: "/chats/philife?tab=inbox",
  listEmptyMessage: "받은 커뮤니티 메시지가 없어요.",
  inboxPath: "/chats/philife?tab=inbox",
  openPath: "/chats/philife?tab=open",
  inboxTabLabel: "1:1",
  openTabLabel: "오픈채팅",
  inboxEmptyMessage: "받은 커뮤니티 메시지가 없어요.",
  openEmptyMessage: "참여 중인 오픈채팅이 없어요.",
  /** 커뮤니티 오픈채팅 허브 — 채팅 허브에서 안내 링크용 */
  boardFeedPath: "/philife",
  boardFeedLinkLabel: "커뮤니티에서 채팅 시작하기",
  openFeedLinkLabel: "오픈채팅 둘러보기",
  /**
   * 거래 목록에 예외적으로 섞일 때 `generalChat.kind === "community"` 뱃지 (현재 API 분리로 거의 미사용).
   */
  tradeListRoomBadgeLabel: "1:1",
} as const;

export type CommunityChatSurface = typeof COMMUNITY_CHAT_SURFACE;
