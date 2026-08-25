import { classifyAdminCouponDashboardBucket } from "@/lib/stores/admin-coupon-control-shell";

export const ADMIN_COUPON_LIST_PAGE_SIZE = 10;

export type AdminCouponListStatusFilter = "all" | "active" | "waiting" | "ended";
export type AdminCouponListFundingFilter = "all" | "STORE_FUNDED" | "PLATFORM_FUNDED" | "SHARED_FUNDED";

export type AdminCouponListRowInput = {
  store_id: string;
  lifecycle_state?: string | null;
  funding_mode?: string | null;
};

export function matchesAdminCouponListStatus(
  lifecycleState: string | null | undefined,
  filter: AdminCouponListStatusFilter
): boolean {
  if (filter === "all") return true;
  return classifyAdminCouponDashboardBucket(String(lifecycleState ?? "")) === filter;
}

export function matchesAdminCouponListFunding(
  fundingMode: string | null | undefined,
  filter: AdminCouponListFundingFilter
): boolean {
  if (filter === "all") return true;
  return String(fundingMode ?? "") === filter;
}

export function filterAdminCouponListRows<T extends AdminCouponListRowInput>(
  rows: T[],
  input: {
    status: AdminCouponListStatusFilter;
    funding: AdminCouponListFundingFilter;
    storeId: string;
  }
): T[] {
  const storeId = input.storeId.trim();
  return rows.filter((row) => {
    if (!matchesAdminCouponListStatus(row.lifecycle_state, input.status)) return false;
    if (!matchesAdminCouponListFunding(row.funding_mode, input.funding)) return false;
    if (storeId && String(row.store_id) !== storeId) return false;
    return true;
  });
}

export function paginateAdminCouponListRows<T>(rows: T[], page: number, pageSize = ADMIN_COUPON_LIST_PAGE_SIZE): T[] {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * size;
  return rows.slice(start, start + size);
}

export function adminCouponListPageCount(total: number, pageSize = ADMIN_COUPON_LIST_PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.ceil(total / Math.max(1, pageSize));
}
