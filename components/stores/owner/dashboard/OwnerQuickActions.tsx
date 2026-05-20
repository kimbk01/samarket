"use client";

/**
 * @deprecated 하단 탭은 `BusinessAdminShell` → `OwnerMobileBottomNav` 단일 마운트.
 * 호환용 — `storeId` 만 전달.
 */
export function OwnerQuickActions({
  storeId,
  chatBadge,
}: {
  storeId: string;
  aboveMainBottomNav?: boolean;
  variant?: "hub" | "orders";
  chatBadge?: number;
}) {
  void storeId;
  void chatBadge;
  return null;
}
