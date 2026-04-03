/**
 * 필라이프 클라이언트·서버에서 호출하는 `/api/philife/*` URL 단일 정의.
 * 라우트 파일은 `app/api/philife/` 아래에 두고, 여기 경로와 반드시 일치시킵니다.
 */
const PHILIFE_API = "/api/philife" as const;

export function philifeUploadImageUrl(): string {
  return `${PHILIFE_API}/upload-image`;
}

export function philifeNeighborhoodPostsUrl(): string {
  return `${PHILIFE_API}/neighborhood-posts`;
}

/** 모임 만들기 폼 — `allow_meetup` 피드 주제 목록 (어드민 `community_topics` 연동) */
export function philifeMeetupFeedTopicsUrl(): string {
  return `${PHILIFE_API}/meetup-feed-topics`;
}

export function philifeNeighborhoodPostUrl(postId: string): string {
  return `${PHILIFE_API}/neighborhood-posts/${encodeURIComponent(postId)}`;
}

/** `searchParams`는 이미 인코딩된 쿼리 문자열 (예: `p.toString()`). */
export function philifeNeighborhoodFeedUrl(searchParams: string): string {
  return `${PHILIFE_API}/neighborhood-feed?${searchParams}`;
}

/** 홈 피드 칩·글쓰기 카테고리 — 어드민 `community_topics`(dongnae) 연동 */
export function philifeNeighborhoodTopicOptionsUrl(): string {
  return `${PHILIFE_API}/neighborhood-topic-options`;
}

export function philifePostsRootUrl(): string {
  return `${PHILIFE_API}/posts`;
}

export function philifePostViewUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/view`;
}

export function philifePostLikeUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/like`;
}

export function philifePostCommentsUrl(postId: string): string {
  return `${PHILIFE_API}/posts/${encodeURIComponent(postId)}/comments`;
}

export function philifeMeetingApi(meetingId: string) {
  const b = `${PHILIFE_API}/meetings/${encodeURIComponent(meetingId)}`;
  return {
    detail: b,
    inviteCandidates: (q: string) => `${b}/invite-candidates?q=${encodeURIComponent(q)}`,
    attendance: () => `${b}/attendance`,
    close: () => `${b}/close`,
    kick: () => `${b}/kick`,
    cohost: () => `${b}/cohost`,
    approve: () => `${b}/approve`,
    reject: () => `${b}/reject`,
    notices: () => `${b}/notices`,
    notice: (noticeId: string) => `${b}/notices/${encodeURIComponent(noticeId)}`,
    invite: () => `${b}/invite`,
    ban: () => `${b}/ban`,
    unban: () => `${b}/unban`,
    join: () => `${b}/join`,
    leave: () => `${b}/leave`,
    events: (query: string) => `${b}/events?${query}`,
  };
}

export function philifeOpenChatRoomsUrl(searchParams?: string): string {
  return searchParams ? `${PHILIFE_API}/open-chat/rooms?${searchParams}` : `${PHILIFE_API}/open-chat/rooms`;
}

export function philifeOpenChatRoomApi(roomId: string) {
  const b = `${PHILIFE_API}/open-chat/rooms/${encodeURIComponent(roomId)}`;
  return {
    detail: () => b,
    join: () => `${b}/join`,
    leave: () => `${b}/leave`,
    nickname: () => `${b}/nickname`,
    moderator: () => `${b}/moderator`,
    unmoderator: () => `${b}/unmoderator`,
    approve: () => `${b}/approve`,
    reject: () => `${b}/reject`,
    notice: () => `${b}/notice`,
    noticeItem: (noticeId: string) => `${b}/notice/${encodeURIComponent(noticeId)}`,
    kick: () => `${b}/kick`,
    ban: () => `${b}/ban`,
    blind: () => `${b}/blind`,
    unblind: () => `${b}/unblind`,
    unban: () => `${b}/unban`,
  };
}
