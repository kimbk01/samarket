import type { RequireAuthActionType } from "@/lib/auth/require-auth-action";

/** 프로필 완성 gate 에서 검사하는 필드 */
export type ProfileRequirementField =
  | "display_name"
  | "phone_verified"
  | "dibay_id"
  | "default_address"
  | "recipient_phone";

export type ProfileActionType =
  | "community_write"
  | "community_comment"
  | "community_like"
  | "community_bookmark"
  | "community_report"
  | "trade_create_item"
  | "trade_chat"
  | "trade_buy"
  | "messenger_open"
  | "messenger_new_chat"
  | "messenger_send_message"
  | "messenger_add_friend"
  | "friend_chat"
  | "delivery_cart_add"
  | "delivery_order"
  | "order_chat"
  | "owner_store_register"
  | "trade_favorite"
  | "trade_report"
  | "review_write"
  | "call_start";

/**
 * 가입 완료 조건 = 동의 + 전화 인증 + 대표 주소 (Owner 2026-11-20 「승인, 구현 진행」, `dibay-registration-steps`).
 * 회원 행동(글쓰기·댓글·좋아요·북마크·채팅·주문·통화 걸기·친구 추가)은 모두 이 두 항목을 요구한다. 신고는 제외(재감사 N1).
 * 열람(`messenger_open` 등)은 요구하지 않는다 — 가입 진행 중 회원도 읽기 가능.
 */
export const REGISTRATION_REQUIRED_FIELDS: ProfileRequirementField[] = ["phone_verified", "default_address"];

/**
 * 실질 행동 공통 — 가입 조건(전화·대표 주소) + 표시 이름.
 * @아이디 커스텀 변경은 Feature Gate 가 아니다 (자동 지급 ID = 정상).
 */
export const ACTION_ACCESS_BASE_FIELDS: ProfileRequirementField[] = [
  ...REGISTRATION_REQUIRED_FIELDS,
  "display_name",
];

/** requireAuthAction actionType → profile actionType (로그인만 필요한 타입 제외) */
export function toProfileActionType(actionType: RequireAuthActionType): ProfileActionType | null {
  switch (actionType) {
    case "community_write":
      return "community_write";
    case "community_comment":
      return "community_comment";
    case "community_like":
    case "community_bookmark":
      return actionType;
    case "community_report":
      return "community_report";
    case "trade_create_item":
      return "trade_create_item";
    case "trade_chat":
      return "trade_chat";
    case "trade_buy":
      return "trade_buy";
    case "messenger_open":
      return "messenger_open";
    case "friend_add":
      return "messenger_add_friend";
    case "messenger_new_chat":
      return "messenger_new_chat";
    case "friend_chat":
      return "friend_chat";
    case "delivery_cart_add":
      return "delivery_cart_add";
    case "delivery_order":
      return "delivery_order";
    case "order_chat":
      return "order_chat";
    case "owner_dashboard":
      return "owner_store_register";
    case "trade_favorite":
      return "trade_favorite";
    case "trade_report":
      return "trade_report";
    case "review_write":
      return "review_write";
    case "voice_call":
    case "video_call":
      return "call_start";
    default:
      return null;
  }
}

export const ACTION_PROFILE_REQUIREMENTS: Record<ProfileActionType, ProfileRequirementField[]> = {
  community_write: ACTION_ACCESS_BASE_FIELDS,
  community_comment: ACTION_ACCESS_BASE_FIELDS,
  community_like: REGISTRATION_REQUIRED_FIELDS,
  community_bookmark: REGISTRATION_REQUIRED_FIELDS,
  /** 신고는 가입 조건 없음 — 받은 괴롭힘·사기 신고는 가입 진행 중에도 (서버 동의 예외 report_block_support 와 같음, 재감사 N1) */
  community_report: [],
  trade_create_item: ACTION_ACCESS_BASE_FIELDS,
  trade_chat: ACTION_ACCESS_BASE_FIELDS,
  trade_buy: REGISTRATION_REQUIRED_FIELDS,
  trade_favorite: REGISTRATION_REQUIRED_FIELDS,
  trade_report: [],
  review_write: ACTION_ACCESS_BASE_FIELDS,
  /** 메신저 열람 — 페이지 진입 popup 금지(읽기 가능). 전송·새채팅·통화는 별 action. */
  messenger_open: [],
  messenger_new_chat: ACTION_ACCESS_BASE_FIELDS,
  messenger_send_message: ACTION_ACCESS_BASE_FIELDS,
  messenger_add_friend: ACTION_ACCESS_BASE_FIELDS,
  friend_chat: ACTION_ACCESS_BASE_FIELDS,
  delivery_cart_add: ACTION_ACCESS_BASE_FIELDS,
  delivery_order: [...ACTION_ACCESS_BASE_FIELDS, "recipient_phone"],
  order_chat: ACTION_ACCESS_BASE_FIELDS,
  /** 입점 신청 — 전화 인증 + 표시명 + 주소록 대표 주소 */
  owner_store_register: ACTION_ACCESS_BASE_FIELDS,
  /** 음성·영상 통화 걸기 — 받은 통화(수락·종료)는 행동 게이트를 거치지 않는다 */
  call_start: REGISTRATION_REQUIRED_FIELDS,
};

/**
 * 라우트 서버 게이트(`requireProfileFieldsForAction`)가 대표 주소를 DB 로 확인하는 행동 — 2026-11-20 이전 그대로.
 * 나머지 행동의 대표 주소는 중앙 쓰기 게이트가 집행한다(쓰기 게이트 스냅샷 1회, 추가 조회 0).
 */
export const SERVER_ROUTE_ADDRESS_CHECK_ACTIONS: ReadonlySet<ProfileActionType> = new Set<ProfileActionType>([
  "trade_create_item",
  "trade_buy",
  "delivery_order",
  "owner_store_register",
]);

export type ProfileCompletionModalVariant =
  | "community"
  | "trade"
  | "messenger"
  | "delivery"
  | "owner"
  | "generic";

export function modalVariantForAction(actionType: ProfileActionType): ProfileCompletionModalVariant {
  switch (actionType) {
    case "community_write":
    case "community_comment":
      return "community";
    case "trade_create_item":
    case "trade_chat":
    case "trade_buy":
    case "trade_favorite":
    case "trade_report":
    case "review_write":
      return "trade";
    case "messenger_open":
    case "messenger_new_chat":
    case "messenger_send_message":
    case "messenger_add_friend":
    case "friend_chat":
    case "call_start":
      return "messenger";
    case "delivery_cart_add":
    case "delivery_order":
    case "order_chat":
      return "delivery";
    case "owner_store_register":
      return "owner";
    default:
      return "generic";
  }
}

/** required query param slug — ProfileEditForm 섹션 강조용 */
export function fieldToRequiredSlug(field: ProfileRequirementField): string {
  switch (field) {
    case "display_name":
      return "nickname";
    case "phone_verified":
    case "recipient_phone":
      return "phone";
    case "dibay_id":
      return "public_id";
    case "default_address":
      return "address";
    default:
      return field;
  }
}

/** URL `required` slug → ProfileEditForm 내부 slug */
export function normalizeRequiredSlugFromUrl(slug: string): string {
  const trimmed = slug.trim();
  if (trimmed === "public_id") return "dibay_id";
  return trimmed;
}

export function buildRequiredQuery(fields: ProfileRequirementField[]): string {
  const slugs = [...new Set(fields.map(fieldToRequiredSlug))];
  return slugs.join(",");
}
