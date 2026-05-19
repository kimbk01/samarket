"use client";

import { OwnerMobileBottomNav } from "@/components/stores/owner/OwnerMobileBottomNav";

/** Hub dashboard bottom bar — mockup: 주문관리·메뉴·품절·채팅·매출 */
export function OwnerQuickActions({
  storeId,
  variant = "hub",
  chatBadge,
}: {
  storeId: string;
  aboveMainBottomNav?: boolean;
  variant?: "hub" | "orders";
  chatBadge?: number;
}) {
  return <OwnerMobileBottomNav storeId={storeId} variant={variant} chatBadge={chatBadge} />;
}
