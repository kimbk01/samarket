/**
 * 커뮤니티·일반 DM — API `segment=community`, 앱 허브 정본은 `/chats/philife`.
 * 레거시 `/chats/community` 는 호환 리다이렉트로 유지하며,
 * 게시판 피드도 `/philife` 표면을 기준으로 연동한다.
 */
export {
  COMMUNITY_CHAT_SURFACE,
  type CommunityChatSurface,
} from "../surfaces/community-chat-surface";
