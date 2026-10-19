/** 관리자 회원관리 → 회원이 참여한 채팅방 (전체채팅 `user_id` 필터) */
export function adminMemberMessengerHref(userId: string): string {
  const id = userId.trim();
  // C-10: 참여자 user_id 서버 필터 (전체채팅) — 닉네임 텍스트 검색이 아님.
  return `/admin/chats?user_id=${encodeURIComponent(id)}`;
}
