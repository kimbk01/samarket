/**
 * 회원 쓰기 규칙 표 — 단일 정의(SSOT). 설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §4·§5-1
 * (Owner 2026-11-21 「설계대로 진행」).
 *
 * 대상: 회원 쓰기(PRODUCT_WRITE) 중 약관 동의 예외가 아닌 모든 경로. 예외 경로(신고·탈퇴·읽음 처리 등)는
 * `member-consent-mutation-policy` 가 먼저 통과시키므로 여기에는 없다.
 *
 * kind
 * - "new"    새로 만드는 행동(글·댓글·좋아요 추가·채팅·주문·결제·친구/모임 참여·초대·신청) → 가입(전화 인증 + 대표 주소) 필요
 * - "manage" 이미 있는 내 것의 관리(사진 올리기 단계 포함 — 글 등록 자체가 "new" 로 막힌다)(수정·삭제·해제·거절·취소·숨기기·읽음·방장/모임장 관리·고객지원·설정·통화·매장 운영) → 가입 없이 가능
 * - "split"  한 경로에 둘이 함께 → 중앙 쓰기 게이트는 통과시키고, 라우트가 새 행동 분기에서만
 *            `requireRegistrationForAction` 을 부른다
 *
 * 서버 중앙 쓰기 게이트(`member-registration-mutation-policy`)와 화면 요청 단계 안내(`registration-guidance-fetch-gate`)가
 * 둘 다 이 표만 읽는다. 새 회원 쓰기 경로가 이 표에 없으면 계약 테스트가 실패한다
 * (`lib/auth/__tests__/member-action-registry-contract.test.ts`).
 *
 * 이 파일은 서버·클라이언트 공용 — 서버 전용 모듈을 가져오지 않는다.
 */

export type MemberWriteKind = "new" | "manage" | "split";

export type MemberWriteEntry = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Next.js app 경로 모양 (`[param]` 은 경로 한 칸) */
  path: string;
  kind: MemberWriteKind;
};

const W = (method: MemberWriteEntry["method"], path: string, kind: MemberWriteKind): MemberWriteEntry => ({
  method,
  path,
  kind,
});

export const MEMBER_WRITE_REGISTRY: readonly MemberWriteEntry[] = [
  W("POST", "/api/ads/apply", "new"),
  W("POST", "/api/auth/naver/callback", "manage"),
  W("POST", "/api/auth/naver/start", "manage"),
  W("POST", "/api/chat/create-room", "new"),
  W("POST", "/api/chat/item/start", "new"),
  W("POST", "/api/chat/messages/[id]/hide", "manage"),
  W("POST", "/api/chat/room/[roomId]/send", "new"),
  W("POST", "/api/chat/rooms/[roomId]/appointments", "new"),
  W("POST", "/api/chat/rooms/[roomId]/lock", "manage"),
  W("POST", "/api/chat/rooms/[roomId]/messages", "new"),
  W("POST", "/api/chat/rooms/[roomId]/reopen", "manage"),
  W("POST", "/api/chat/rooms/[roomId]/trade-status", "manage"),
  W("POST", "/api/chat/rooms/[roomId]/unlock", "manage"),
  W("POST", "/api/community-messenger/bridge/product-chat", "manage"),
  W("POST", "/api/community-messenger/calls/attempts/[attemptId]/cancel", "manage"),
  W("POST", "/api/community-messenger/calls/redial-room", "manage"),
  W("POST", "/api/community-messenger/calls/sessions/stale-cleanup", "manage"),
  W("POST", "/api/community-messenger/calls/stub-message", "manage"),
  W("DELETE", "/api/community-messenger/contacts", "manage"),
  W("DELETE", "/api/community-messenger/contacts/consent", "manage"),
  W("POST", "/api/community-messenger/contacts/consent", "manage"),
  W("PATCH", "/api/community-messenger/contacts/settings", "manage"),
  W("POST", "/api/community-messenger/contacts/sources", "manage"),
  W("DELETE", "/api/community-messenger/contacts/sources/[sourceId]", "manage"),
  W("PATCH", "/api/community-messenger/contacts/sources/[sourceId]", "manage"),
  W("DELETE", "/api/community-messenger/contacts/suppressions/[userId]", "manage"),
  W("POST", "/api/community-messenger/contacts/suppressions/[userId]", "manage"),
  W("POST", "/api/community-messenger/contacts/sync", "manage"),
  W("POST", "/api/community-messenger/direct/start", "manage"),
  W("POST", "/api/community-messenger/friend-qr/add", "new"),
  W("POST", "/api/community-messenger/friend-qr/regenerate", "manage"),
  W("POST", "/api/community-messenger/friend-requests", "new"),
  W("DELETE", "/api/community-messenger/friend-requests/[requestId]", "manage"),
  W("PATCH", "/api/community-messenger/friend-requests/[requestId]", "split"),
  W("POST", "/api/community-messenger/friend-requests/cancel-outgoing", "manage"),
  W("POST", "/api/community-messenger/friend-requests/rejected", "manage"),
  W("POST", "/api/community-messenger/friend-requests/respond-incoming", "split"),
  W("POST", "/api/community-messenger/friends/[friendUserId]/favorite", "manage"),
  W("POST", "/api/community-messenger/group-rooms", "new"),
  W("DELETE", "/api/community-messenger/group-rooms/[roomId]/bans", "manage"),
  W("POST", "/api/community-messenger/group-rooms/[roomId]/bans", "manage"),
  W("POST", "/api/community-messenger/group-rooms/[roomId]/join-requests", "manage"),
  W("POST", "/api/community-messenger/group-rooms/[roomId]/media", "manage"),
  W("DELETE", "/api/community-messenger/group-rooms/[roomId]/participants", "manage"),
  W("POST", "/api/community-messenger/group-rooms/[roomId]/participants", "new"),
  W("PATCH", "/api/community-messenger/group-rooms/[roomId]/pinned-message", "manage"),
  W("PATCH", "/api/community-messenger/group-rooms/[roomId]/profile", "manage"),
  W("PATCH", "/api/community-messenger/group-rooms/[roomId]/roles", "manage"),
  W("PATCH", "/api/community-messenger/group-rooms/[roomId]/settings", "manage"),
  W("POST", "/api/community-messenger/group-rooms/join", "new"),
  W("POST", "/api/community-messenger/group-rooms/join-request", "new"),
  W("POST", "/api/community-messenger/groups/create", "new"),
  W("POST", "/api/community-messenger/open-groups/[roomId]/join", "new"),
  W("POST", "/api/community-messenger/rooms", "split"),
  W("PATCH", "/api/community-messenger/rooms/[roomId]", "split"),
  W("POST", "/api/community-messenger/rooms/[roomId]/calls", "manage"),
  W("POST", "/api/community-messenger/rooms/[roomId]/files", "new"),
  W("POST", "/api/community-messenger/rooms/[roomId]/files/upload-url", "new"),
  W("POST", "/api/community-messenger/rooms/[roomId]/images", "new"),
  W("POST", "/api/community-messenger/rooms/[roomId]/images/upload-urls", "new"),
  W("POST", "/api/community-messenger/rooms/[roomId]/messages", "new"),
  W("PATCH", "/api/community-messenger/rooms/[roomId]/messages/[messageId]", "manage"),
  W("POST", "/api/community-messenger/rooms/[roomId]/messages/[messageId]/reactions", "split"),
  W("POST", "/api/community-messenger/rooms/[roomId]/messages/forward", "new"),
  W("POST", "/api/community-messenger/rooms/[roomId]/messages/sticker", "new"),
  W("PATCH", "/api/community-messenger/rooms/[roomId]/settings", "manage"),
  W("POST", "/api/community-messenger/rooms/[roomId]/voice", "new"),
  W("POST", "/api/community/neighbor-relations", "split"),
  W("POST", "/api/community/neighborhood-posts", "new"),
  W("PATCH", "/api/community/neighborhood-posts/[postId]", "manage"),
  W("POST", "/api/community/posts", "new"),
  W("POST", "/api/community/posts/[postId]/comments", "new"),
  W("PATCH", "/api/community/posts/[postId]/comments/[commentId]", "manage"),
  W("POST", "/api/community/posts/[postId]/comments/[commentId]/like", "split"),
  W("DELETE", "/api/community/posts/[postId]/like", "manage"),
  W("POST", "/api/community/posts/[postId]/like", "split"),
  W("DELETE", "/api/community/posts/[postId]/save", "manage"),
  W("POST", "/api/community/posts/[postId]/save", "split"),
  W("POST", "/api/community/posts/[postId]/share/internal", "new"),
  W("POST", "/api/community/upload-image", "manage"),
  W("POST", "/api/community/upload-image-from-url", "manage"),
  W("POST", "/api/community/upload-image/discard", "manage"),
  W("POST", "/api/favorites/toggle", "split"),
  W("POST", "/api/feed-ads/events", "manage"),
  W("POST", "/api/group-chat/rooms", "new"),
  W("POST", "/api/group-chat/rooms/[roomId]/join", "new"),
  W("POST", "/api/group-chat/rooms/[roomId]/messages", "new"),
  W("POST", "/api/launch-intro/events", "manage"),
  W("POST", "/api/me/admin-notes", "manage"),
  W("POST", "/api/me/admin-notes/[threadId]", "manage"),
  W("POST", "/api/me/app-releases", "manage"),
  W("POST", "/api/me/apple-iap/outcome", "manage"),
  W("POST", "/api/me/apple-iap/prepare", "new"),
  W("POST", "/api/me/apple-iap/verify", "manage"),
  W("POST", "/api/me/delivery-ads/[campaignId]/funding", "manage"),
  W("POST", "/api/me/delivery-ads/partner", "manage"),
  W("POST", "/api/me/dibay-id/confirm", "manage"),
  W("PATCH", "/api/me/discovery-settings", "manage"),
  W("POST", "/api/me/event-promotion-requests", "new"),
  W("DELETE", "/api/me/event-promotion-requests/[requestId]", "manage"),
  W("PATCH", "/api/me/event-promotion-requests/[requestId]", "manage"),
  W("POST", "/api/me/event-promotion-requests/[requestId]/submit", "new"),
  W("POST", "/api/me/event-promotion-requests/[requestId]/upload-image", "new"),
  W("POST", "/api/me/feed-ad-campaigns/[id]/renew", "new"),
  W("POST", "/api/me/feed-ad-requests", "new"),
  W("PATCH", "/api/me/feed-ad-requests/[id]", "manage"),
  W("POST", "/api/me/feed-ad-requests/upload", "new"),
  W("POST", "/api/me/gift-certificates/purchase", "new"),
  W("POST", "/api/me/gift-certificates/transfers/[transferId]/accept", "new"),
  W("POST", "/api/me/gift-certificates/transfers/offer", "new"),
  W("POST", "/api/me/gift-certificates/transfers/presentation", "manage"),
  W("POST", "/api/me/platform-popup-requests", "new"),
  W("PATCH", "/api/me/platform-popup-requests/[requestId]", "manage"),
  W("POST", "/api/me/platform-popup-requests/[requestId]/creative", "new"),
  W("POST", "/api/me/platform-popup-requests/[requestId]/submit", "new"),
  W("POST", "/api/me/points/charge", "new"),
  W("POST", "/api/me/points/promotion-orders", "new"),
  W("POST", "/api/me/posts/bulk-region", "manage"),
  W("DELETE", "/api/me/recent-views", "manage"),
  W("POST", "/api/me/registration/discard-empty-account", "manage"),
  W("POST", "/api/me/settings/notices", "manage"),
  W("POST", "/api/me/settings/notices/[noticeId]/comments", "new"),
  W("DELETE", "/api/me/settings/notices/[noticeId]/comments/[commentId]", "manage"),
  W("POST", "/api/me/store-cart/revalidate", "manage"),
  W("PATCH", "/api/me/store-coupons/campaigns", "manage"),
  W("POST", "/api/me/store-coupons/campaigns", "manage"),
  W("POST", "/api/me/store-coupons/claim", "new"),
  W("POST", "/api/me/store-orders", "new"),
  W("POST", "/api/me/store-phone-verification/send", "manage"),
  W("POST", "/api/me/store-phone-verification/verify", "manage"),
  W("POST", "/api/me/store-reviews", "new"),
  W("POST", "/api/me/store-reviews/upload-image", "new"),
  W("POST", "/api/me/stores", "new"),
  W("PATCH", "/api/me/stores/[storeId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/banners", "manage"),
  W("DELETE", "/api/me/stores/[storeId]/banners/[bannerId]", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/banners/[bannerId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/business-cash", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-ads", "manage"),
  W("DELETE", "/api/me/stores/[storeId]/delivery-ads/[campaignId]", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/delivery-ads/[campaignId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-ads/banner", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-ads/upload-banner-image", "manage"),
  W("POST", "/api/me/stores/[storeId]/delivery-service-areas", "manage"),
  W("PUT", "/api/me/stores/[storeId]/delivery-service-areas", "manage"),
  W("POST", "/api/me/stores/[storeId]/gift-certificates/applications", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/inquiries/[inquiryId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/menu-sections", "manage"),
  W("DELETE", "/api/me/stores/[storeId]/menu-sections/[sectionId]", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/menu-sections/[sectionId]", "manage"),
  W("PUT", "/api/me/stores/[storeId]/menu-sections/order", "manage"),
  W("POST", "/api/me/stores/[storeId]/notices", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/notices/[noticeId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/partner-agreement", "manage"),
  W("POST", "/api/me/stores/[storeId]/products", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/products/[productId]", "manage"),
  W("POST", "/api/me/stores/[storeId]/resubmit", "manage"),
  W("PATCH", "/api/me/stores/[storeId]/reviews/[reviewId]/reply", "manage"),
  W("POST", "/api/me/stores/[storeId]/upload-image", "manage"),
  W("POST", "/api/me/stores/announcements/[noticeId]/view", "manage"),
  W("POST", "/api/me/username/confirm", "manage"),
  W("POST", "/api/moim", "new"),
  W("PATCH", "/api/moim/[moimId]", "manage"),
  W("POST", "/api/moim/[moimId]/album", "new"),
  W("POST", "/api/moim/[moimId]/boards", "new"),
  W("POST", "/api/moim/[moimId]/close", "manage"),
  W("POST", "/api/moim/[moimId]/host-inactive-request", "manage"),
  W("POST", "/api/moim/[moimId]/host-transfer", "manage"),
  W("POST", "/api/moim/[moimId]/invite-links", "new"),
  W("POST", "/api/moim/[moimId]/invites", "new"),
  W("POST", "/api/moim/[moimId]/join", "new"),
  W("POST", "/api/moim/[moimId]/join-requests/[requestId]", "manage"),
  W("PATCH", "/api/moim/[moimId]/members/[userId]", "manage"),
  W("POST", "/api/moim/[moimId]/members/[userId]/remove", "manage"),
  W("POST", "/api/moim/[moimId]/members/[userId]/unban", "manage"),
  W("PATCH", "/api/moim/[moimId]/notification-prefs", "manage"),
  W("PATCH", "/api/moim/[moimId]/permissions", "manage"),
  W("POST", "/api/moim/[moimId]/posts", "new"),
  W("PATCH", "/api/moim/[moimId]/profile", "manage"),
  W("POST", "/api/moim/[moimId]/schedules", "new"),
  W("POST", "/api/moim/album/[itemId]/pin", "manage"),
  W("POST", "/api/moim/host-transfers/[transferId]", "manage"),
  W("DELETE", "/api/moim/invite-links/[inviteId]", "manage"),
  W("POST", "/api/moim/invites/[inviteId]", "split"),
  W("PATCH", "/api/moim/posts/[postId]", "manage"),
  W("POST", "/api/moim/posts/[postId]/comments", "new"),
  W("POST", "/api/moim/posts/[postId]/pin", "manage"),
  W("DELETE", "/api/moim/schedules/[scheduleId]", "manage"),
  W("PATCH", "/api/moim/schedules/[scheduleId]", "manage"),
  W("POST", "/api/moim/schedules/[scheduleId]/close", "manage"),
  W("POST", "/api/moim/schedules/[scheduleId]/join", "new"),
  W("POST", "/api/moim/schedules/[scheduleId]/participants/[userId]", "manage"),
  W("POST", "/api/offers", "new"),
  W("POST", "/api/offers/[id]/accept", "manage"),
  W("POST", "/api/offers/[id]/reject", "manage"),
  W("POST", "/api/offers/[id]/withdraw", "manage"),
  W("POST", "/api/philife/neighborhood-posts", "new"),
  W("PATCH", "/api/philife/neighborhood-posts/[postId]", "manage"),
  W("POST", "/api/philife/posts", "new"),
  W("POST", "/api/philife/posts/[postId]/comments", "new"),
  W("PATCH", "/api/philife/posts/[postId]/comments/[commentId]", "manage"),
  W("POST", "/api/philife/posts/[postId]/comments/[commentId]/like", "split"),
  W("POST", "/api/philife/posts/[postId]/like", "split"),
  W("POST", "/api/philife/upload-image", "manage"),
  W("POST", "/api/philife/upload-image-from-url", "manage"),
  W("POST", "/api/posts/[postId]/comments", "new"),
  W("DELETE", "/api/posts/[postId]/hide", "manage"),
  W("PUT", "/api/posts/[postId]/hide", "manage"),
  W("POST", "/api/posts/[postId]/job-apply", "new"),
  W("POST", "/api/posts/[postId]/owner-status", "manage"),
  W("PATCH", "/api/posts/[postId]/owner-trade-update", "manage"),
  W("POST", "/api/posts/[postId]/seller-listing-state", "manage"),
  W("POST", "/api/posts/[postId]/trade-lifecycle", "manage"),
  W("POST", "/api/posts/create", "new"),
  W("POST", "/api/posts/listing-visibility", "manage"),
  W("POST", "/api/posts/upload-image", "manage"),
  W("DELETE", "/api/stores/[slug]/favorite", "manage"),
  W("POST", "/api/stores/[slug]/favorite", "new"),
  W("POST", "/api/trade/chat/entry/resolve", "split"),
  W("POST", "/api/trade/product-chat/[roomId]/buyer-confirm", "manage"),
  W("POST", "/api/trade/product-chat/[roomId]/buyer-issue", "manage"),
  W("POST", "/api/trade/product-chat/[roomId]/rating", "new"),
  W("POST", "/api/trade/product-chat/[roomId]/seller-complete", "manage"),
  W("POST", "/api/trade/ratings/[id]/dispute", "manage"),
];

function shapeToRegExp(shape: string): RegExp {
  const escaped = shape
    .split("/")
    .map((seg) => (/^\[[^\]]+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escaped}$`);
}

/** 정확 경로를 먼저, `[param]` 경로를 나중에 — `/rooms` 와 `/rooms/[roomId]` 처럼 겹치지 않게 */
const COMPILED = MEMBER_WRITE_REGISTRY.map((e) => ({ ...e, re: shapeToRegExp(e.path), dynamic: e.path.includes("[") }))
  .sort((a, b) => Number(a.dynamic) - Number(b.dynamic));

function normalizePath(pathname: string): string {
  const p = String(pathname ?? "").split("?")[0] ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function findMemberWriteEntry(method: string, pathname: string): MemberWriteEntry | null {
  const m = String(method ?? "").toUpperCase();
  const p = normalizePath(pathname);
  return COMPILED.find((e) => e.method === m && e.re.test(p)) ?? null;
}

/** 이 요청이 가입(전화 + 대표 주소)을 요구하는 새 행동인가. 표에 없는 경로는 서버가 판단(중앙 게이트 기본 = 요구). */
export function isRegistrationRequiredWrite(method: string, pathname: string): boolean {
  return findMemberWriteEntry(method, pathname)?.kind === "new";
}
