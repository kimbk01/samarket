import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";
import { legacyStoreOrdersRedirectTarget } from "@/lib/admin/store-orders/admin-store-order-ops-contract";

/**
 * 주문 액션 — orders that need an admin decision only. Older list links that carried
 * list filters (`order_status`, `store_id`, `order_no`, …) move to 주문 목록 with the same params.
 */
export default async function AdminStoreOrdersRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") sp.set(k, v);
    else if (Array.isArray(v) && v[0] != null) sp.set(k, v[0]);
  }
  const target = legacyStoreOrdersRedirectTarget(sp);
  if (target) redirect(target);
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="exceptions" />
    </Suspense>
  );
}
