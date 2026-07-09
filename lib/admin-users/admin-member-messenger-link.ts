/** 관리자 회원관리 → 커뮤니티 메신저 운영 화면(구매자 id 검색) */
export function adminMemberMessengerHref(userId: string): string {
  const id = userId.trim();
  return `/admin/chats/messenger?q=${encodeURIComponent(id)}`;
}
