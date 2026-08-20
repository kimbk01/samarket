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
  | "owner_store_register";

/**
 * 실질 행동 공통 — 전화·표시 이름.
 * @아이디 커스텀 변경은 Feature Gate 가 아니다 (자동 지급 ID = 정상).
 */
export const ACTION_ACCESS_BASE_FIELDS: ProfileRequirementField[] = [
  "phone_verified",
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
    default:
      return null;
  }
}

export const ACTION_PROFILE_REQUIREMENTS: Record<ProfileActionType, ProfileRequirementField[]> = {
  community_write: ACTION_ACCESS_BASE_FIELDS,
  community_comment: ACTION_ACCESS_BASE_FIELDS,
  community_like: [],
  community_bookmark: [],
  community_report: [],
  trade_create_item: [...ACTION_ACCESS_BASE_FIELDS, "default_address"],
  trade_chat: ACTION_ACCESS_BASE_FIELDS,
  trade_buy: ["phone_verified", "default_address"],
  /** 메신저 열람 — 페이지 진입 popup 금지. 전송·새채팅·통화는 별 action. */
  messenger_open: [],
  messenger_new_chat: ACTION_ACCESS_BASE_FIELDS,
  messenger_send_message: ACTION_ACCESS_BASE_FIELDS,
  messenger_add_friend: ["display_name"],
  friend_chat: ["display_name"],
  delivery_cart_add: ACTION_ACCESS_BASE_FIELDS,
  delivery_order: [...ACTION_ACCESS_BASE_FIELDS, "default_address", "recipient_phone"],
  order_chat: ACTION_ACCESS_BASE_FIELDS,
  /** 입점 신청 — 전화 인증 + 표시명 + 주소록 대표 주소 */
  owner_store_register: [...ACTION_ACCESS_BASE_FIELDS, "default_address"],
};

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
      return "trade";
    case "messenger_open":
    case "messenger_new_chat":
    case "messenger_send_message":
    case "messenger_add_friend":
    case "friend_chat":
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
