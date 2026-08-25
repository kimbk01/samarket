/**
 * Admin coupon Control Center — realized funding is a READ of order snapshots
 * joined through store_coupon_redemptions. Not campaign.reserved_spend_php.
 * Not percent × discount. Not a stored second ledger.
 */

export type CouponControlOrderFact = {
  order_id: string;
  order_no: string;
  order_status: string | null;
  discount_amount: number;
  store_funded_amount: number;
  platform_funded_amount: number;
  net_settlement_amount: number | null;
  settlement_status: string | null;
};

export type CouponControlRealizedTotals = {
  customer_discount: number;
  store_funded: number;
  platform_funded: number;
};

function money(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function projectCouponControlOrderFact(input: {
  order_id: string;
  order_no?: string | null;
  order_status?: string | null;
  discount_amount?: unknown;
  store_funded_amount?: unknown;
  platform_funded_amount?: unknown;
  net_settlement_amount?: unknown;
  settlement_status?: string | null;
}): CouponControlOrderFact {
  return {
    order_id: String(input.order_id),
    order_no: String(input.order_no ?? "").trim(),
    order_status: input.order_status ? String(input.order_status) : null,
    discount_amount: money(input.discount_amount),
    store_funded_amount: money(input.store_funded_amount),
    platform_funded_amount: money(input.platform_funded_amount),
    net_settlement_amount:
      input.net_settlement_amount == null ? null : money(input.net_settlement_amount),
    settlement_status: input.settlement_status ? String(input.settlement_status) : null,
  };
}

export function summarizeCouponControlRealized(
  orders: CouponControlOrderFact[]
): CouponControlRealizedTotals {
  let customer_discount = 0;
  let store_funded = 0;
  let platform_funded = 0;
  for (const o of orders) {
    customer_discount += o.discount_amount;
    store_funded += o.store_funded_amount;
    platform_funded += o.platform_funded_amount;
  }
  return { customer_discount, store_funded, platform_funded };
}

export type CouponControlAuditFact = {
  action: string;
  reason: string | null;
  actor_label: string | null;
  created_at: string;
};

export type CouponControlCampaignView = {
  id: string;
  store_id: string;
  store_name: string;
  title: string;
  terms_copy: string | null;
  is_active: boolean;
  computed_state: "active" | "upcoming" | "expired" | "inactive";
  lifecycle_state: string;
  funding_mode: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  first_order_scope: string | null;
  start_at: string | null;
  end_at: string | null;
  usage_end_at: string | null;
  issued_count: number;
  issue_limit: number | null;
  claimed_count: number;
  redeemed_count: number;
  spend_budget_php: number | null;
  reserved_spend_php: number;
  budget_remaining: number | null;
  policy_store_share: number | null;
  realized: CouponControlRealizedTotals;
  orders: CouponControlOrderFact[];
  audits: CouponControlAuditFact[];
};

export function couponControlActionsForLifecycle(state: string): {
  approve: boolean;
  reject: boolean;
  pause: boolean;
  resume: boolean;
  revoke: boolean;
} {
  const s = String(state || "");
  return {
    approve: s === "requested" || s === "draft" || s === "approved",
    reject: s === "requested",
    pause: s === "active" || s === "scheduled" || s === "approved",
    resume: s === "paused",
    revoke: s !== "revoked" && s !== "ended" && s !== "rejected",
  };
}

export function assembleCouponControlCampaignView(input: {
  campaign: Record<string, unknown>;
  storeName: string;
  claimedCount: number;
  redeemedCount: number;
  orders: CouponControlOrderFact[];
  audits: CouponControlAuditFact[];
}): CouponControlCampaignView {
  const c = input.campaign;
  const spend = c.spend_budget_php == null ? null : money(c.spend_budget_php);
  const reserved = money(c.reserved_spend_php);
  const isActive = c.is_active !== false;
  const startAt = c.start_at ? String(c.start_at) : null;
  const endAt = c.end_at ? String(c.end_at) : null;
  const now = Date.now();
  const startMs = startAt ? Date.parse(startAt) : NaN;
  const endMs = endAt ? Date.parse(endAt) : NaN;
  let computed_state: CouponControlCampaignView["computed_state"] = "inactive";
  if (isActive && Number.isFinite(startMs) && Number.isFinite(endMs)) {
    if (endMs <= now) computed_state = "expired";
    else if (startMs > now) computed_state = "upcoming";
    else computed_state = "active";
  }
  return {
    id: String(c.id ?? ""),
    store_id: String(c.store_id ?? ""),
    store_name: input.storeName,
    title: String(c.title ?? ""),
    terms_copy: c.terms_copy == null ? null : String(c.terms_copy),
    is_active: isActive,
    computed_state,
    lifecycle_state: String(c.lifecycle_state ?? (isActive ? "active" : "inactive")),
    funding_mode: String(c.funding_mode ?? "STORE_FUNDED"),
    discount_type: String(c.discount_type ?? ""),
    discount_value: money(c.discount_value),
    min_order_amount: c.min_order_amount == null ? null : money(c.min_order_amount),
    first_order_scope: c.first_order_scope == null ? null : String(c.first_order_scope),
    start_at: c.start_at ? String(c.start_at) : null,
    end_at: c.end_at ? String(c.end_at) : null,
    usage_end_at: c.usage_end_at ? String(c.usage_end_at) : null,
    issued_count: money(c.issued_count),
    issue_limit: c.issue_limit == null ? null : money(c.issue_limit),
    claimed_count: input.claimedCount,
    redeemed_count: input.redeemedCount,
    spend_budget_php: spend,
    reserved_spend_php: reserved,
    budget_remaining: spend == null ? null : Math.max(0, spend - reserved),
    policy_store_share: c.store_funded_amount == null ? null : money(c.store_funded_amount),
    realized: summarizeCouponControlRealized(input.orders),
    orders: input.orders,
    audits: input.audits,
  };
}
