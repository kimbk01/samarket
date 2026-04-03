import type { MeetingOpenChatMessagePublic, MeetingOpenChatRoomPublic } from "./types";

export type MeetingOpenChatRoomInitialChatMember = {
  memberId: string;
  role: string;
  openNickname: string;
  openProfileImageUrl: string | null;
};

/** RSC에서 MeetingOpenChatRoomClient 로 전달하는 스냅샷 */
export type MeetingOpenChatRoomInitialData = {
  room: MeetingOpenChatRoomPublic;
  chatMember: MeetingOpenChatRoomInitialChatMember | null;
  viewerUnreadCount: number;
  viewerSuggestedOpenNickname: string | null;
  viewerSuggestedRealname: string | null;
  /** 방 멤버이고 서버에서 메시지 목록을 가져온 경우만(빈 배열 포함) */
  initialMessages?: MeetingOpenChatMessagePublic[];
};
