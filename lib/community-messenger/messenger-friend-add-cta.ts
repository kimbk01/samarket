import type {
  CommunityMessengerBootstrap,
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";

/**
 * 친구 추가 UX — 검색·프로필 시트에서 동일한 상태 분기.
 * `requests` 는 부트스트랩의 pending 목록(`listCommunityMessengerFriendRequests` 기준).
 */
export type MessengerFriendAddCta =
  | { kind: "add" }
  | { kind: "pending_outgoing"; requestId: string }
  | { kind: "pending_incoming"; requestId: string }
  | { kind: "friend" }
  | { kind: "blocked" };

/** UI 문구 통일 (프롬프트 CTA 기준) */
export const MessengerFriendAddCtaLabels = {
  add: "친구 추가",
  pending: "요청중",
  cancel: "요청 취소",
  accept: "수락",
  reject: "거절",
  friend: "친구",
  message: "메시지 보내기",
  unavailable: "이용 불가",
  blockedChip: "차단됨",
} as const;

/** `MessengerFriendRequestsSheet` — 섹션·빈 목록·헤더 (CTA 버튼은 `MessengerFriendAddCtaLabels`) */
export const MessengerFriendRequestSheetLabels = {
  title: "친구 요청",
  sectionReceived: "받은 요청",
  sectionSent: "보낸 요청",
  sectionSuggested: "추천",
  subtitleReceived: "받은 요청",
  subtitleSent: "보낸 요청",
  emptyReceived: "받은 요청이 없습니다.",
  emptySent: "보낸 요청이 없습니다.",
  emptySuggested: "추천이 없습니다.",
  openProfile: "보기",
  processing: "처리 중…",
} as const;

export function resolveMessengerFriendAddCta(
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">,
  viewerUserId: string,
  requests: CommunityMessengerFriendRequest[]
): MessengerFriendAddCta {
  const vid = viewerUserId.trim();
  const pid = peer.id.trim();
  if (!vid || !pid) return { kind: "add" };
  if (peer.blocked) return { kind: "blocked" };
  if (peer.isFriend) return { kind: "friend" };

  for (const r of requests) {
    if (r.status !== "pending") continue;
    if (r.requesterId === vid && r.addresseeId === pid) return { kind: "pending_outgoing", requestId: r.id };
    if (r.requesterId === pid && r.addresseeId === vid) return { kind: "pending_incoming", requestId: r.id };
  }
  return { kind: "add" };
}

/** 시트를 연 직후 부트스트랩이 갱신되면 친구·차단 등 플래그를 최신으로 맞춤 */
export function mergeCommunityMessengerProfileFromBootstrap(
  profile: CommunityMessengerProfileLite,
  bootstrap: CommunityMessengerBootstrap | null
): CommunityMessengerProfileLite {
  if (!bootstrap) return profile;
  const id = profile.id;
  const pools = [
    ...(bootstrap.friends ?? []),
    ...(bootstrap.hidden ?? []),
    ...(bootstrap.blocked ?? []),
    ...(bootstrap.following ?? []),
  ];
  const hit = pools.find((p) => p.id === id);
  if (!hit) return profile;
  return { ...profile, ...hit };
}
