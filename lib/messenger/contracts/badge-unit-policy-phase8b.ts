/**
 * Phase 8B — Badge 표면별 최종 단위 정책 (D1-2 LOCK).
 * OS Badge setter · production wiring 금지.
 */
export const D1_2_APP_ICON_UNIT_OPEN = false as const;

/** App Icon = notificationEventCount only */
export const D1_2_APP_ICON_UNIT = "notificationEventCount" as const;

export const PHASE8B_BADGE_UNIT_POLICY = {
  rowBadge: "unreadMessageCount",
  hubBadge: "unreadRoomCount",
  messengerNav: "unreadRoomCount",
  appIcon: "notificationEventCount",
  deliveryNav: "orderIdentityUnionSize",
} as const;

export type Phase8bBadgeSurface = keyof typeof PHASE8B_BADGE_UNIT_POLICY;

export function assertPhase8bRowBadgeUsesMessageCount(unit: string): void {
  if (unit !== PHASE8B_BADGE_UNIT_POLICY.rowBadge) {
    throw new Error(`dibay_phase8b_row_badge_unit:${unit}`);
  }
}

export function assertPhase8bHubBadgeUsesRoomCount(unit: string): void {
  if (unit !== PHASE8B_BADGE_UNIT_POLICY.hubBadge) {
    throw new Error(`dibay_phase8b_hub_badge_unit:${unit}`);
  }
}

export function assertPhase8bMessengerNavUsesRoomCount(unit: string): void {
  if (unit !== PHASE8B_BADGE_UNIT_POLICY.messengerNav) {
    throw new Error(`dibay_phase8b_messenger_nav_unit:${unit}`);
  }
}

export function assertPhase8bAppIconUsesNotificationEvents(unit: string): void {
  if (unit !== PHASE8B_BADGE_UNIT_POLICY.appIcon) {
    throw new Error(`dibay_phase8b_app_icon_unit:${unit}`);
  }
}

export function assertPhase8bAppIconDoesNotUseRoomOrMessage(unit: string): void {
  if (unit === "unreadRoomCount" || unit === "unreadMessageCount") {
    throw new Error(`dibay_phase8b_app_icon_forbids_unit:${unit}`);
  }
}

export const PHASE8B_BADGE_PRODUCTION_WIRING = false as const;
