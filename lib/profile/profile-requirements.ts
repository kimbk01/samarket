import type { RequireAuthActionType } from "@/lib/auth/require-auth-action";

/** 프로필 완성 gate 에서 검사하는 필드 */
export type ProfileRequirementField =
  | "display_name"
  | "phone_verified"
  | "dibay_id"
  | "default_address"
  | "recipient_phone";

/** 메신저·채팅 진입 SSOT — messenger_open / trade_chat / order_chat 등이 동일 배열을 참조한다. */
export const MESSENGER_CHAT_ACCESS_FIELDS = [
  "phone_verified",
  "dibay_id",
  "display_name",
] as const satisfies readonly ProfileRequirementField[];

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
  | "messenger_add_friend"
  | "friend_chat"
  | "order_chat"
  | "delivery_order"
  | "owner_store_register";

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
    case "friend_add":
      return "messenger_add_friend";
    case "messenger_new_chat":
      return "messenger_new_chat";
    case "friend_chat":
      return "friend_chat";
    case "messenger_open":
      return "messenger_open";
    case "order_chat":
      return "order_chat";
    case "delivery_order":
      return "delivery_order";
    case "owner_dashboard":
      return "owner_store_register";
    default:
      return null;
  }
}

export const ACTION_PROFILE_REQUIREMENTS: Record<ProfileActionType, ProfileRequirementField[]> = {
  community_write: ["display_name"],
  community_comment: ["display_name"],
  community_like: [],
  community_bookmark: [],
  community_report: [],
  trade_create_item: ["phone_verified", "display_name", "default_address"], // spec: trade_sell
  trade_chat: [...MESSENGER_CHAT_ACCESS_FIELDS],
  trade_buy: ["phone_verified", "default_address"],
  messenger_open: [...MESSENGER_CHAT_ACCESS_FIELDS],
  messenger_new_chat: [...MESSENGER_CHAT_ACCESS_FIELDS],
  messenger_add_friend: ["display_name", "dibay_id"],
  friend_chat: [...MESSENGER_CHAT_ACCESS_FIELDS],
  order_chat: [...MESSENGER_CHAT_ACCESS_FIELDS],
  delivery_order: ["phone_verified", "default_address", "recipient_phone"], // spec: delivery_checkout
  owner_store_register: ["phone_verified"],
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
    case "messenger_add_friend":
    case "friend_chat":
    case "order_chat":
      return "messenger";
    case "delivery_order":
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
