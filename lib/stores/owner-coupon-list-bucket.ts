import { isStoreCouponLifecycleState } from "@/lib/stores/store-coupon-ssot";
import {
  checkOwnerCouponTransition,
  effectiveCouponState,
  isOwnerCouponTransitionAction,
} from "@/lib/stores/store-coupon-effective-state";

export type OwnerCouponListTab = "active" | "upcoming" | "ended";

export type OwnerCouponListStatus = "active" | "upcoming" | "paused" | "ended" | "requested";

export type OwnerCouponListRowInput = {
  lifecycle_state: string;
  /** ADS-23 — lifecycle active 인데 is_active=false 면 claim 불가 → 일시정지로 표시 */
  is_active?: boolean | null;
  start_at?: string | null;
  end_at?: string | null;
};

/** ADS-23 — 오너·관리자 목록 탭도 `effectiveCouponState`(claim 과 같은 판정)에서만 파생한다. */
export function ownerCouponListTab(
  row: OwnerCouponListRowInput,
  nowMs: number = Date.now()
): OwnerCouponListTab {
  const eff = effectiveCouponState(row, nowMs);
  if (eff === "ended" || eff === "revoked" || eff === "rejected") return "ended";
  if (eff === "scheduled" || eff === "draft" || eff === "requested" || eff === "approved") return "upcoming";
  return "active";
}

export function ownerCouponListStatus(
  row: OwnerCouponListRowInput,
  nowMs: number = Date.now()
): OwnerCouponListStatus {
  const eff = effectiveCouponState(row, nowMs);
  if (eff === "ended" || eff === "revoked" || eff === "rejected") return "ended";
  if (eff === "paused" || eff === "inactive") return "paused";
  if (eff === "requested") return "requested";
  if (eff === "scheduled" || eff === "draft" || eff === "approved") return "upcoming";
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

export type OwnerCouponDetailAction = "pause" | "resume" | "end" | "reissue";

/**
 * B3 detail CTAs — same pause/resume/end/reissue writers as the owner PATCH.
 * `row` 를 주면 서버 전이표(IA-04 · D-18)로 거른다: 관리자 일시정지는 재개 없음, 종료·회수는 재발행만.
 */
export function ownerCouponDetailActions(
  status: OwnerCouponListStatus,
  opts?: {
    fundingMode?: string | null;
    row?: { lifecycle_state?: string | null; is_active?: boolean | null; paused_by?: string | null } | null;
  }
): OwnerCouponDetailAction[] {
  const funding = String(opts?.fundingMode ?? "STORE_FUNDED");
  // SSOT: Owner operates STORE_FUNDED only; PLATFORM/SHARED = KPI view.
  if (funding !== "STORE_FUNDED") return [];
  if (status === "requested") return [];
  let base: OwnerCouponDetailAction[];
  if (status === "ended") base = ["reissue"];
  else if (status === "paused") base = ["resume", "end", "reissue"];
  else base = ["pause", "end", "reissue"];
  const row = opts?.row;
  if (!row) return base;
  return base.filter(
    (a) => a === "reissue" || (isOwnerCouponTransitionAction(a) && checkOwnerCouponTransition(a, row).ok)
  );
}

export function isOwnerCouponLifecycleKnown(state: string): boolean {
  return isStoreCouponLifecycleState(state);
}
