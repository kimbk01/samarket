/**
 * Advertising Statement — canonical facts adapter (ADDENDUM LOCK §2).
 * No unified ads table. Role surfaces = field mask only over domain rows.
 */

export type AdvertisingStatementRole = "admin" | "member" | "owner";

export type AdvertisingStatementSource =
  | "MEMBER"
  | "OWNER"
  | "ADMIN"
  | "HOUSE_AD";

export type AdvertisingStatementDomain =
  | "community"
  | "trade"
  | "delivery"
  | "popup";

export type AdvertisingHistoryEvent = {
  at: string;
  event: string;
  actorType?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Canonical facts — all roles share this shape; masks hide fields. */
export type AdvertisingStatement = {
  adId: string;
  domain: AdvertisingStatementDomain;
  product: string;
  placement: string;
  source: AdvertisingStatementSource;
  applicantId: string | null;
  advertiserLabel: string | null;
  objectId: string | null;
  objectLabel: string | null;
  creativeRef: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  durationDays: number | null;
  unitPrice: number | null;
  originalPrice: number | null;
  discount: number | null;
  finalPrice: number | null;
  currency: string | null;
  paymentStatus: string | null;
  paymentId: string | null;
  refund: string | null;
  currentStatus: string;
  adminDecision: string | null;
  /** Admin-only; never on member/owner mask */
  internalMemos: Array<{ adminId: string; memo: string; createdAt: string }>;
  /** Applicant-visible revision/reject reason */
  publicAdminMessage: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  endedAt: string | null;
  history: AdvertisingHistoryEvent[];
};

export type AdvertisingStatementPublic = Omit<AdvertisingStatement, "internalMemos">;

const ADMIN_ONLY_KEYS = ["internalMemos"] as const;

export function maskAdvertisingStatement(
  statement: AdvertisingStatement,
  role: AdvertisingStatementRole
): AdvertisingStatement | AdvertisingStatementPublic {
  if (role === "admin") return statement;
  const { internalMemos: _hidden, ...rest } = statement;
  void _hidden;
  return rest;
}

export function assertStatementRoleMaskContract(): {
  adminSeesInternalMemo: true;
  memberOwnerHideInternalMemo: true;
  sharedFactKeys: readonly string[];
} {
  return {
    adminSeesInternalMemo: true,
    memberOwnerHideInternalMemo: true,
    sharedFactKeys: [
      "adId",
      "domain",
      "product",
      "placement",
      "source",
      "startAt",
      "endAt",
      "finalPrice",
      "currency",
      "paymentStatus",
      "currentStatus",
      "publicAdminMessage",
      "history",
    ],
  };
}

void ADMIN_ONLY_KEYS;

/** Map point_promotion_orders row → statement (Boost / Trade·Community). */
export function statementFromPointPromotionOrder(
  row: Record<string, unknown>,
  history: AdvertisingHistoryEvent[] = []
): AdvertisingStatement {
  const domainRaw = String(row.domain ?? "");
  const domain: AdvertisingStatementDomain =
    domainRaw === "community" ? "community" : "trade";
  const status = String(row.order_status ?? "");
  const pointCost = Number(row.point_cost ?? 0);
  return {
    adId: String(row.id ?? ""),
    domain,
    product: String(row.product_id ?? row.placement ?? ""),
    placement: String(row.placement ?? ""),
    source: "MEMBER",
    applicantId: row.user_id != null ? String(row.user_id) : null,
    advertiserLabel: row.user_nickname != null ? String(row.user_nickname) : null,
    objectId: row.target_id != null ? String(row.target_id) : null,
    objectLabel: row.target_title != null ? String(row.target_title) : null,
    creativeRef: null,
    startAt: row.start_at != null ? String(row.start_at) : null,
    endAt: row.end_at != null ? String(row.end_at) : null,
    timezone: null,
    durationDays:
      row.duration_days != null ? Math.max(0, Number(row.duration_days)) : null,
    unitPrice: Number.isFinite(pointCost) ? pointCost : null,
    originalPrice: Number.isFinite(pointCost) ? pointCost : null,
    discount: 0,
    finalPrice: Number.isFinite(pointCost) ? pointCost : null,
    currency: "D_POINT",
    paymentStatus:
      status === "pending_review"
        ? "HOLD"
        : status === "rejected" || status === "cancelled"
          ? "RELEASED"
          : status === "active" || status === "ended"
            ? "CAPTURED"
            : status,
    paymentId: null,
    refund: null,
    currentStatus: status,
    adminDecision: row.review_reason != null ? String(row.review_reason) : null,
    internalMemos: [],
    publicAdminMessage:
      row.review_reason != null &&
      (status === "rejected" || String(row.review_reason).length > 0)
        ? String(row.review_reason)
        : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    approvedAt: null,
    activatedAt:
      status === "active" || status === "ended"
        ? row.start_at != null
          ? String(row.start_at)
          : null
        : null,
    endedAt:
      status === "ended" || status === "cancelled" || status === "rejected"
        ? row.updated_at != null
          ? String(row.updated_at)
          : null
        : null,
    history,
  };
}

/** Map Delivery campaign commercial + lifecycle fields (banner / sponsored). */
export function statementFromDeliveryCampaign(input: {
  campaignId: string;
  productKind: "banner" | "store_sponsored";
  inventoryKey: string;
  source: AdvertisingStatementSource;
  applicantId?: string | null;
  advertiserLabel?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  creativeRef?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  lifecycleStatus: string;
  finalPriceMinor?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  paymentId?: string | null;
  publicAdminMessage?: string | null;
  internalMemos?: AdvertisingStatement["internalMemos"];
  createdAt?: string | null;
  history?: AdvertisingHistoryEvent[];
}): AdvertisingStatement {
  const price =
    input.finalPriceMinor != null && Number.isFinite(input.finalPriceMinor)
      ? input.finalPriceMinor
      : null;
  return {
    adId: input.campaignId,
    domain: "delivery",
    product: input.productKind,
    placement: input.inventoryKey,
    source: input.source,
    applicantId: input.applicantId ?? null,
    advertiserLabel: input.advertiserLabel ?? input.storeName ?? null,
    objectId: input.storeId ?? null,
    objectLabel: input.storeName ?? null,
    creativeRef: input.creativeRef ?? null,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    timezone: null,
    durationDays: null,
    unitPrice: price,
    originalPrice: price,
    discount: 0,
    finalPrice: price,
    currency: input.currency ?? "PHP",
    paymentStatus: input.paymentStatus ?? null,
    paymentId: input.paymentId ?? null,
    refund: null,
    currentStatus: input.lifecycleStatus,
    adminDecision: null,
    internalMemos: input.internalMemos ?? [],
    publicAdminMessage: input.publicAdminMessage ?? null,
    createdAt: input.createdAt ?? null,
    approvedAt: null,
    activatedAt: null,
    endedAt: null,
    history: input.history ?? [],
  };
}

/** Map Feed Banner request/campaign row. */
export function statementFromFeedAd(input: {
  id: string;
  domain: "trade" | "community";
  placement: string;
  source: AdvertisingStatementSource;
  applicantId?: string | null;
  advertiserLabel?: string | null;
  objectId?: string | null;
  creativeRef?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  status: string;
  pointCost?: number | null;
  publicAdminMessage?: string | null;
  createdAt?: string | null;
  history?: AdvertisingHistoryEvent[];
}): AdvertisingStatement {
  const cost =
    input.pointCost != null && Number.isFinite(input.pointCost) ? input.pointCost : null;
  return {
    adId: input.id,
    domain: input.domain,
    product: "feed_banner",
    placement: input.placement,
    source: input.source,
    applicantId: input.applicantId ?? null,
    advertiserLabel: input.advertiserLabel ?? null,
    objectId: input.objectId ?? null,
    objectLabel: null,
    creativeRef: input.creativeRef ?? null,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    timezone: null,
    durationDays: null,
    unitPrice: cost,
    originalPrice: cost,
    discount: 0,
    finalPrice: cost,
    currency: "D_POINT",
    paymentStatus: null,
    paymentId: null,
    refund: null,
    currentStatus: input.status,
    adminDecision: null,
    internalMemos: [],
    publicAdminMessage: input.publicAdminMessage ?? null,
    createdAt: input.createdAt ?? null,
    approvedAt: null,
    activatedAt: null,
    endedAt: null,
    history: input.history ?? [],
  };
}

/** Map Platform Popup campaign. */
export function statementFromPlatformPopup(input: {
  id: string;
  surface: string;
  source: AdvertisingStatementSource;
  applicantId?: string | null;
  advertiserLabel?: string | null;
  storeId?: string | null;
  creativeRef?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  status: string;
  priceMinor?: number | null;
  currency?: string | null;
  publicAdminMessage?: string | null;
  createdAt?: string | null;
  history?: AdvertisingHistoryEvent[];
}): AdvertisingStatement {
  const price =
    input.priceMinor != null && Number.isFinite(input.priceMinor) ? input.priceMinor : null;
  return {
    adId: input.id,
    domain: "popup",
    product: "platform_popup",
    placement: input.surface,
    source: input.source,
    applicantId: input.applicantId ?? null,
    advertiserLabel: input.advertiserLabel ?? null,
    objectId: input.storeId ?? null,
    objectLabel: null,
    creativeRef: input.creativeRef ?? null,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    timezone: null,
    durationDays: null,
    unitPrice: price,
    originalPrice: price,
    discount: 0,
    finalPrice: price,
    currency: input.currency ?? null,
    paymentStatus: null,
    paymentId: null,
    refund: null,
    currentStatus: input.status,
    adminDecision: null,
    internalMemos: [],
    publicAdminMessage: input.publicAdminMessage ?? null,
    createdAt: input.createdAt ?? null,
    approvedAt: null,
    activatedAt: null,
    endedAt: null,
    history: input.history ?? [],
  };
}
