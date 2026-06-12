import type { AdminPostAdRow, AdApplyStatus, AdPaymentMethod, AdType } from "@/lib/ads/types";
import type {
  AdApplication,
  AdApplicationLog,
  AdApplicationStatus,
  AdLogActionType,
  AdPaymentMethod as LegacyPaymentMethod,
  AdPaymentStatus,
  AdPlacement,
  AdTargetType,
  PromotedItem,
  PromotedItemStatus,
} from "@/lib/types/ad-application";

function mapApplyStatus(status: AdApplyStatus): AdApplicationStatus {
  switch (status) {
    case "draft":
    case "pending_review":
      return "pending";
    case "pending_payment":
      return "waiting_payment";
    case "approved":
      return "approved";
    case "active":
      return "active";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function mapPaymentMethod(method: AdPaymentMethod): LegacyPaymentMethod {
  if (method === "bank_transfer") return "bank_transfer";
  if (method === "manual") return "manual_confirm";
  return "manual_confirm";
}

function inferPaymentStatus(
  applyStatus: AdApplyStatus,
  paymentMethod: AdPaymentMethod,
  pointCost: number
): AdPaymentStatus {
  if (applyStatus === "rejected" && paymentMethod === "points" && pointCost > 0) {
    return "refunded";
  }
  if (paymentMethod === "points" && pointCost > 0) {
    return "paid";
  }
  if (applyStatus === "pending_payment") {
    return paymentMethod === "bank_transfer" ? "waiting_confirm" : "unpaid";
  }
  if (["pending_review", "approved", "active", "expired"].includes(applyStatus)) {
    return "paid";
  }
  return "unpaid";
}

function mapAdTypeToPlacement(adType: AdType): AdPlacement {
  if (adType === "mid_insert") return "home_middle";
  if (adType === "highlight") return "search_top";
  return "home_top";
}

function inferDurationDays(startAt: string | null, endAt: string | null, fallback = 3): number {
  if (startAt && endAt) {
    const ms = Date.parse(endAt) - Date.parse(startAt);
    if (Number.isFinite(ms) && ms > 0) {
      return Math.max(1, Math.round(ms / 86400000));
    }
  }
  return fallback;
}

function inferPromotedStatus(
  applyStatus: AdApplyStatus,
  startAt: string | null,
  endAt: string | null
): PromotedItemStatus | null {
  if (!["approved", "active", "expired"].includes(applyStatus)) {
    return null;
  }
  const now = Date.now();
  if (applyStatus === "expired") return "expired";
  if (startAt && Date.parse(startAt) > now) return "scheduled";
  if (endAt && Date.parse(endAt) < now) return "expired";
  if (applyStatus === "active") return "active";
  if (applyStatus === "approved") return "scheduled";
  return null;
}

export interface PostAdApplicationSource extends AdminPostAdRow {
  durationDays?: number;
  priority?: number;
}

export function mapPostAdRowToApplication(row: PostAdApplicationSource): AdApplication {
  const durationDays = row.durationDays ?? inferDurationDays(row.startAt, row.endAt);
  return {
    id: row.id,
    applicantUserId: row.userId,
    applicantNickname: row.userNickname?.trim() || row.userId.slice(0, 8),
    targetType: "banner" satisfies AdTargetType,
    targetId: row.postId,
    targetTitle: row.postTitle?.trim() || "(제목 없음)",
    placement: mapAdTypeToPlacement(row.adType),
    planName: row.adProductName?.trim() || "-",
    durationDays,
    unitPrice: row.pointCost,
    totalPrice: row.pointCost,
    paymentMethod: mapPaymentMethod(row.paymentMethod),
    paymentStatus: inferPaymentStatus(row.applyStatus, row.paymentMethod, row.pointCost),
    applicationStatus: mapApplyStatus(row.applyStatus),
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    adminMemo: row.adminNote ?? undefined,
  };
}

export function mapPostAdRowToPromotedItem(row: PostAdApplicationSource): PromotedItem | null {
  const status = inferPromotedStatus(row.applyStatus, row.startAt, row.endAt);
  if (!status || !row.startAt || !row.endAt) return null;
  return {
    id: `pi-${row.id}`,
    adApplicationId: row.id,
    targetType: "banner",
    targetId: row.postId,
    targetTitle: row.postTitle?.trim() || "(제목 없음)",
    placement: mapAdTypeToPlacement(row.adType),
    status,
    startAt: row.startAt,
    endAt: row.endAt,
    priority: row.priority ?? 100,
    createdAt: row.createdAt,
  };
}

const LOG_TYPE_TO_ACTION: Record<string, AdLogActionType> = {
  applied: "apply",
  approved: "approve",
  rejected: "reject",
  cancelled: "cancel",
  expired: "expire",
  payment_confirmed: "mark_paid",
  note_updated: "update",
  activated: "activate",
};

export function mapAdLogRow(
  row: {
    id: string;
    post_ad_id: string;
    actor_id: string | null;
    log_type: string;
    payload: Record<string, unknown> | null;
    created_at: string;
  },
  actorNickname = "관리자"
): AdApplicationLog {
  const payload = row.payload ?? {};
  const note = typeof payload.note === "string" ? payload.note : "";
  return {
    id: row.id,
    adApplicationId: row.post_ad_id,
    actionType: LOG_TYPE_TO_ACTION[row.log_type] ?? "update",
    actorType: row.actor_id ? "admin" : "user",
    actorId: row.actor_id ?? "",
    actorNickname,
    note,
    createdAt: row.created_at,
  };
}
