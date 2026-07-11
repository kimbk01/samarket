/**
 * Phase 2 — Notification Engine Decision (flags only; no consumer execution).
 */

export type NotificationDecision = {
  playSound: boolean;
  showBottomBadge: boolean;
  showListBadge: boolean;
  push: boolean;
  persist: boolean;
  suppressReasons: string[];
};

export function createNotificationDecision(partial: Partial<NotificationDecision> & Pick<NotificationDecision, "persist">): NotificationDecision {
  return {
    playSound: partial.playSound ?? false,
    showBottomBadge: partial.showBottomBadge ?? false,
    showListBadge: partial.showListBadge ?? false,
    push: partial.push ?? false,
    persist: partial.persist,
    suppressReasons: partial.suppressReasons ?? [],
  };
}
