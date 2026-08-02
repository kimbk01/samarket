/**
 * Slice 2-1 — Badge Authority classification types.
 * Pure foundation. DO NOT import from product Bell / App Icon / FCM / Native paths.
 */

export type BadgeAuthority =
  | "A_MEMBER_NOTIFICATION"
  | "B_MEMBER_COMMUNICATION"
  | "B_STORE_COMMUNICATION"
  | "C_STORE_OPERATION";

export type BadgeAuthorityClassification =
  | BadgeAuthority
  | "EPHEMERAL_NO_BADGE"
  | "UNKNOWN_BLOCKED";

export type BadgeSurface =
  | "MEMBER_BELL"
  | "MEMBER_NOTIFICATION_INBOX"
  | "MEMBER_APP_ICON"
  | "BOTTOM_CHAT"
  | "TRADE_HUB"
  | "CUSTOMER_ORDER_HUB"
  | "MEMBER_CHAT_ROW"
  | "MEMBER_MISSED_CALL"
  | "OWNER_STORE_ORDER_ROW"
  | "OWNER_CHAT_SURFACE"
  | "OWNER_OPERATION_BADGE"
  | "OWNER_DELIVERY_BOTTOM"
  | "OWNER_ADMIN_OPERATION"
  | "STORE_MISSED_CALL"
  | "NATIVE_MEMBER_APP_ICON";

export const SLICE_2_1_FOUNDATION_VERSION = "badge_authority_rebuild_slice2_1_v1" as const;

export const MEMBER_AUTHORITIES = [
  "A_MEMBER_NOTIFICATION",
  "B_MEMBER_COMMUNICATION",
] as const satisfies readonly BadgeAuthority[];

export const STORE_AUTHORITIES = [
  "B_STORE_COMMUNICATION",
  "C_STORE_OPERATION",
] as const satisfies readonly BadgeAuthority[];
