import type { Tier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";
import {
  getNotificationBadgeCountSnapshot,
  patchNotificationBadgeCountSnapshot,
} from "@/lib/notifications/notification-badge-count-store";

/**
 * P0.1 — 운영 공지(admin_notice)는 notification-badge-count `total`에 포함.
 * B4: Header `tier1_inbox_bell` 표시는 badge-count.total 단일 읽기 — 이 supplement를 **다시 가산하지 말 것**.
 * clearOptimistic 은 mark-all 경로에서 R4 소스로 유지.
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
  }, "optimistic_admin");
  return true;
}
