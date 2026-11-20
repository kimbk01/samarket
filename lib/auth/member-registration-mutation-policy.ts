/**
 * 중앙 쓰기 게이트 — 가입(동의 + 전화 인증 + 대표 주소) 검사 예외 (Owner 2026-11-20 「승인, 구현 진행」, 설계 v3 §4-4).
 *
 * 가입 진행 중 회원은 **새 글쓰기·댓글·좋아요·채팅·주문·친구 추가** 같은 회원 행동을 못 한다. 열람·계정 관리는 그대로.
 * 이 목록은 동의 예외(`member-consent-mutation-policy` — 동의 예외는 가입 검사 전에 이미 통과)에 **더해** 가입 검사만 건너뛰는 쓰기다:
 * - 통화 API 전체(시작 포함) — 통화 API 동작 변화 0 (통화 변경 규정). 통화 걸기는 화면 행동 게이트가 막는다.
 * - 매장 사장님 운영(이미 있는 매장) — 운영 중인 매장이 끊기지 않게. 새 입점 신청(`POST /api/me/stores`)은 가입 필요.
 * - 이미 진행 중인 거래·제안·모임·대화방 관리(상태 변경·완료·숨김·잠금) — 새로 만드는 쓰기가 아니다.
 * - 계정·설정·고객지원·결제 완료 확인·계측 — 회원 행동이 아니다.
 * 정확한 메서드+경로만. 접두 예외는 통화·기존 매장 운영·내 연락처·배달 광고 운영 4개뿐.
 */
import { normalizeApiPath } from "@/lib/auth/member-action-policy";

type Rule = { method: string; path: string };

const R = (method: string, path: string): Rule => ({ method, path });

/** 접두 예외 — 이 경로 아래 모든 쓰기 */
const REGISTRATION_EXEMPT_PREFIXES: readonly string[] = [
  "/api/community-messenger/calls/",
  "/api/me/stores/[storeId]/",
  /** 내 연락처(올리기·동기화·철회·삭제) — 회원 행동이 아니라 본인 데이터 관리, 삭제·철회는 개인정보 권리 (재감사 M4) */
  "/api/community-messenger/contacts/",
  /** 사장님 배달 광고 운영 (재감사 M5) */
  "/api/me/delivery-ads/",
];

export const MEMBER_REGISTRATION_EXEMPT_RULES: readonly Rule[] = [
  // 통화 시작 (방 안 통화 버튼) — 통화 API 불변
  R("POST", "/api/community-messenger/rooms/[roomId]/calls"),
  // 채팅방 읽음 처리·음소거·고정·보관·맥락 저장 — 열람에 딸린 쓰기 (재감사 H1: 읽기는 막지 않는다)
  R("PATCH", "/api/community-messenger/rooms/[roomId]"),
  // 거래 채팅을 열 때 메신저 연결 미리 요청 — 열람에 딸린 쓰기 (재감사 L4)
  R("POST", "/api/community-messenger/bridge/product-chat"),
  // 연락처 전체 삭제 (재감사 M4 — 하위 경로는 접두 예외)
  R("DELETE", "/api/community-messenger/contacts"),
  // 사장님 쿠폰 운영 (재감사 M5)
  R("POST", "/api/me/store-coupons/campaigns"),
  R("PATCH", "/api/me/store-coupons/campaigns"),
  // 글 숨기기·숨김 해제 — 본인 화면 정리 (재감사 L3)
  R("PUT", "/api/posts/[postId]/hide"),
  R("DELETE", "/api/posts/[postId]/hide"),
  // 매장 운영 (기존 매장)
  R("PATCH", "/api/me/stores/[storeId]"),
  R("POST", "/api/me/stores/announcements/[noticeId]/view"),
  R("POST", "/api/me/store-phone-verification/send"),
  R("POST", "/api/me/store-phone-verification/verify"),
  // 계정·설정·고객지원
  R("PATCH", "/api/me/discovery-settings"),
  R("DELETE", "/api/me/recent-views"),
  R("POST", "/api/me/dibay-id/confirm"),
  R("POST", "/api/me/username/confirm"),
  R("POST", "/api/me/admin-notes"),
  R("POST", "/api/me/app-releases"),
  R("POST", "/api/community-messenger/friends/[friendUserId]/favorite"),
  R("PATCH", "/api/community-messenger/rooms/[roomId]/settings"),
  R("POST", "/api/community-messenger/friend-requests/cancel-outgoing"),
  R("POST", "/api/community-messenger/friend-requests/rejected"),
  // 결제 완료 확인 (이미 결제한 건이 사라지지 않게)
  R("POST", "/api/me/apple-iap/verify"),
  R("POST", "/api/me/apple-iap/outcome"),
  // 계측
  R("POST", "/api/launch-intro/events"),
  R("POST", "/api/feed-ads/events"),
  R("POST", "/api/me/store-cart/revalidate"),
  // 이미 진행 중인 거래·제안 관리
  R("POST", "/api/chat/rooms/[roomId]/trade-status"),
  R("POST", "/api/chat/rooms/[roomId]/lock"),
  R("POST", "/api/chat/rooms/[roomId]/unlock"),
  R("POST", "/api/chat/rooms/[roomId]/reopen"),
  R("POST", "/api/chat/messages/[id]/hide"),
  R("POST", "/api/trade/product-chat/[roomId]/buyer-confirm"),
  R("POST", "/api/trade/product-chat/[roomId]/buyer-issue"),
  R("POST", "/api/trade/product-chat/[roomId]/seller-complete"),
  R("POST", "/api/trade/ratings/[id]/dispute"),
  R("POST", "/api/posts/[postId]/owner-status"),
  R("POST", "/api/posts/[postId]/trade-lifecycle"),
  R("POST", "/api/posts/[postId]/seller-listing-state"),
  R("PATCH", "/api/posts/[postId]/owner-trade-update"),
  R("POST", "/api/posts/listing-visibility"),
  R("POST", "/api/offers/[id]/accept"),
  R("POST", "/api/offers/[id]/reject"),
  R("POST", "/api/offers/[id]/withdraw"),
  // 이미 있는 모임·그룹 관리
  R("POST", "/api/moim/[moimId]/close"),
  R("POST", "/api/moim/[moimId]/host-transfer"),
  R("POST", "/api/moim/[moimId]/host-inactive-request"),
  R("POST", "/api/moim/[moimId]/join-requests/[requestId]"),
  R("PATCH", "/api/moim/[moimId]/members/[userId]"),
  R("POST", "/api/moim/[moimId]/members/[userId]/remove"),
  R("POST", "/api/moim/[moimId]/members/[userId]/unban"),
  R("PATCH", "/api/moim/[moimId]/notification-prefs"),
  R("PATCH", "/api/moim/[moimId]/permissions"),
  R("POST", "/api/moim/host-transfers/[transferId]"),
  R("DELETE", "/api/moim/invite-links/[inviteId]"),
  R("POST", "/api/moim/schedules/[scheduleId]/close"),
  R("PATCH", "/api/community-messenger/group-rooms/[roomId]/roles"),
  R("PATCH", "/api/community-messenger/group-rooms/[roomId]/settings"),
  R("PATCH", "/api/community-messenger/group-rooms/[roomId]/pinned-message"),
  R("PATCH", "/api/community-messenger/group-rooms/[roomId]/profile"),
];

function shapeToRegExp(shape: string, prefix: boolean): RegExp {
  const escaped = shape
    .split("/")
    .map((seg) => (/^\[[^\]]+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(prefix ? `^${escaped}` : `^${escaped}$`);
}

const COMPILED_RULES = MEMBER_REGISTRATION_EXEMPT_RULES.map((r) => ({ ...r, re: shapeToRegExp(r.path, false) }));
const COMPILED_PREFIXES = REGISTRATION_EXEMPT_PREFIXES.map((p) => shapeToRegExp(p, true));

export type MemberRegistrationMutationClass = "REGISTRATION_REQUIRED" | "REGISTRATION_EXEMPT";

export function resolveMemberRegistrationClassForApiMutation(
  method: string,
  pathname: string,
): MemberRegistrationMutationClass {
  const m = String(method ?? "").toUpperCase();
  const p = normalizeApiPath(pathname);
  if (COMPILED_PREFIXES.some((re) => re.test(p))) return "REGISTRATION_EXEMPT";
  return COMPILED_RULES.some((r) => r.method === m && r.re.test(p)) ? "REGISTRATION_EXEMPT" : "REGISTRATION_REQUIRED";
}
