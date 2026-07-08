import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";
import {
  getNotificationBadgeCountSnapshot,
  patchNotificationBadgeCountSnapshot,
} from "@/lib/notifications/notification-badge-count-store";

/**
 * P0.1 — 운영 공지(admin_notice)는 Philife 하단탭이 아니라 Tier1 통합 종에만 보조 합산.
 * notification_targets SSOT는 유지하고, notification_events.admin_notice 만 얹는다.
 */
export function resolveTier1AdminNoticeBellSupplement(
  surface: Tier1BellBadgeSurface
): number {
  if (surface !== "tier1_inbox_bell") return 0;
  const snap = getNotificationBadgeCountSnapshot();
  return Math.max(0, Math.floor(Number(snap?.adminNotice) || 0));
}

/** tier1 모두 읽음 직후 DOM supplement 즉시 0 — 서버 badge-count resync 전 UI 정합 */
export function clearTier1AdminNoticeBellSupplementOptimistic(): boolean {
  const prev = getNotificationBadgeCountSnapshot();
  if (!prev) return false;
  const adminNotice = Math.max(0, Math.floor(Number(prev.adminNotice) || 0));
  if (adminNotice <= 0) return false;
  patchNotificationBadgeCountSnapshot({
    ...prev,
    adminNotice: 0,
    total: Math.max(0, (prev.total ?? 0) - adminNotice),
  });
  return true;
}
