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
  /** 상대 거절 후 서버 쿨다운 — `remainingMs`는 호출 시점 기준 남은 시간 */
  | { kind: "cooldown"; remainingMs: number }
  | { kind: "friend" }
  | { kind: "blocked" };

import type { MessageKey } from "@/lib/i18n/messages";

/** UI 문구 키 — 컴포넌트에서 `t(MessengerFriendAddCtaLabelKeys.add)` */
export const MessengerFriendAddCtaLabelKeys = {
  add: "cm_friend_cta_add",
  pending: "cm_friend_cta_pending",
  cancel: "cm_friend_cta_cancel",
  accept: "cm_friend_cta_accept",
  reject: "cm_friend_cta_reject",
  friend: "cm_friend_cta_friend",
  message: "cm_friend_cta_message",
  unavailable: "cm_friend_cta_unavailable",
  blockedChip: "cm_friend_cta_blocked",
  cooldown: "cm_friend_cta_cooldown",
} as const satisfies Record<string, MessageKey>;

/** `MessengerFriendRequestsSheet` — 섹션·빈 목록·헤더 */
export const MessengerFriendRequestSheetLabelKeys = {
  title: "cm_friend_sheet_title",
  sectionReceived: "cm_friend_sheet_received",
  sectionSent: "cm_friend_sheet_sent",
  sectionSuggested: "cm_friend_sheet_suggested",
  subtitleReceived: "cm_friend_sheet_sub_received",
  subtitleSent: "cm_friend_sheet_sub_sent",
  emptyReceived: "cm_friend_sheet_empty_received",
  emptySent: "cm_friend_sheet_empty_sent",
  emptySuggested: "cm_friend_sheet_empty_suggested",
  openProfile: "cm_friend_sheet_open_profile",
  processing: "cm_friend_sheet_processing",
} as const satisfies Record<string, MessageKey>;

export type ResolveMessengerFriendAddCtaOpts = {
  /** peer id → unix ms; 해당 시각까지 재요청 불가 UI */
  cooldownUntilByPeerId?: Record<string, number>;
  /** 쿨다운 남은 시간 계산용(검색 행 1초 갱신 등) */
  nowMs?: number;
};

export function resolveMessengerFriendAddCta(
  peer: Pick<CommunityMessengerProfileLite, "id" | "isFriend" | "blocked">,
  viewerUserId: string,
  requests: CommunityMessengerFriendRequest[],
  opts?: ResolveMessengerFriendAddCtaOpts
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

  const now = typeof opts?.nowMs === "number" ? opts.nowMs : Date.now();
  const until = opts?.cooldownUntilByPeerId?.[pid];
  if (until != null && until > now) {
    return { kind: "cooldown", remainingMs: until - now };
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
