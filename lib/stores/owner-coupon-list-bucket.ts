import { isStoreCouponLifecycleState } from "@/lib/stores/store-coupon-ssot";

export type OwnerCouponListTab = "active" | "upcoming" | "ended";

export type OwnerCouponListStatus = "active" | "upcoming" | "paused" | "ended" | "requested";

export type OwnerCouponListRowInput = {
  lifecycle_state: string;
  start_at?: string | null;
  end_at?: string | null;
};

function parseMs(iso: string | null | undefined): number | null {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

export function ownerCouponListTab(
  row: OwnerCouponListRowInput,
  nowMs: number = Date.now()
): OwnerCouponListTab {
  const st = String(row.lifecycle_state ?? "");
  if (st === "ended" || st === "revoked" || st === "rejected") return "ended";
  const endMs = parseMs(row.end_at);
  if (endMs != null && endMs <= nowMs) return "ended";
  if (st === "scheduled" || st === "draft" || st === "requested" || st === "approved") {
    return "upcoming";
  }
  const startMs = parseMs(row.start_at);
  if (startMs != null && startMs > nowMs) return "upcoming";
  return "active";
}

export function ownerCouponListStatus(
  row: OwnerCouponListRowInput,
  nowMs: number = Date.now()
): OwnerCouponListStatus {
  const st = String(row.lifecycle_state ?? "");
  const tab = ownerCouponListTab(row, nowMs);
  if (tab === "ended") return "ended";
  if (st === "paused") return "paused";
  if (st === "requested") return "requested";
  if (tab === "upcoming") return "upcoming";
  return "active";
}

export function ownerCouponListStatusMessageKey(
  status: OwnerCouponListStatus
):
  | "store_coupon_owner_status_active"
  | "store_coupon_owner_status_upcoming"
  | "store_coupon_owner_status_paused"
  | "store_coupon_owner_status_ended"
  | "store_coupon_owner_status_requested" {
  switch (status) {
    case "upcoming":
      return "store_coupon_owner_status_upcoming";
    case "paused":
      return "store_coupon_owner_status_paused";
    case "ended":
      return "store_coupon_owner_status_ended";
    case "requested":
      return "store_coupon_owner_status_requested";
    default:
      return "store_coupon_owner_status_active";
  }
}

export function isOwnerCouponLifecycleKnown(state: string): boolean {
  return isStoreCouponLifecycleState(state);
}
