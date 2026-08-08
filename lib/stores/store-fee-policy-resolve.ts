/**
 * CONTRACT — Delivery commission policy SSOT (resolver + calculator).
 *
 * Precedence (active window, not archived):
 *   1. store override (store_id)
 *   2. secondary category (topic_id → store_topics)
 *   3. primary category (category_id → store_categories)
 *   4. platform default (store_id/topic_id/category_id all null)
 *
 * If none match → missing_policy (explicit fail). NO commerce_settings / env / hardcoded rate.
 *
 * Settlement ledger (`store_settlements.applied_fee_policy_snapshot`) is the
 * immutable financial fact after first write. DO NOT re-resolve on settlement update.
 *
 * Point fees (`store_point_policies`) are a separate product path — not this resolver.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreFeePolicyScope = "store" | "topic" | "category" | "default" | "missing_policy";

export type StoreFeePolicyRow = {
  id: string;
  policy_name: string;
  fee_percent: number | string | null;
  fixed_fee: number | null;
  delivery_fee_mode: string | null;
  delivery_fee_percent: number | string | null;
  store_id?: string | null;
  category_id?: string | null;
  topic_id?: string | null;
};

export type EffectiveStoreFeePolicy = {
  policyId: string | null;
  policyName: string;
  feePercent: number;
  fixedFee: number;
  deliveryFeeMode: string;
  deliveryFeePercent: number;
  scope: StoreFeePolicyScope;
  snapshot: Record<string, unknown>;
};

export type OrderCommissionCalcInput = {
  /** Commission base — DIBAY: store_orders.payment_amount (gross paid). */
  commissionBaseAmount: number;
  deliveryFeeAmount: number;
  feePercent: number;
  fixedFee: number;
  deliveryFeeMode: string | null;
  deliveryFeePercent: number | string | null;
};

export type OrderCommissionCalcResult = {
  commissionBaseAmount: number;
  platformFeePercent: number;
  platformFeeAmount: number;
  fixedFeeAmount: number;
  deliveryIncomeAmount: number;
  /** platform % fee + fixed fee (excludes delivery income). */
  totalPlatformFeeAmount: number;
  netBeforeRefund: number;
};

const FEE_POLICY_SELECT =
  "id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, store_id, category_id, topic_id";

export function clampMoneyInt(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function clampPercent(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Single calculator — floor to integer minor units (PHP). */
export function calculateOrderCommission(input: OrderCommissionCalcInput): OrderCommissionCalcResult {
  const gross = clampMoneyInt(input.commissionBaseAmount);
  const feePercent = clampPercent(input.feePercent);
  const fixedFee = clampMoneyInt(input.fixedFee);
  const percentFee = Math.min(gross, Math.floor((gross * feePercent) / 100));
  const totalPlatformFee = Math.min(gross, percentFee + fixedFee);

  const deliveryFeeAmount = clampMoneyInt(input.deliveryFeeAmount);
  let deliveryIncome = 0;
  if (String(input.deliveryFeeMode ?? "").trim() === "percent") {
    const p = clampPercent(input.deliveryFeePercent);
    deliveryIncome = Math.min(deliveryFeeAmount, Math.floor((deliveryFeeAmount * p) / 100));
  }

  const netBeforeRefund = Math.max(0, gross - percentFee - fixedFee - deliveryIncome);

  return {
    commissionBaseAmount: gross,
    platformFeePercent: feePercent,
    platformFeeAmount: percentFee,
    fixedFeeAmount: fixedFee,
    deliveryIncomeAmount: deliveryIncome,
    totalPlatformFeeAmount: totalPlatformFee,
    netBeforeRefund,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function tableMissing(m: unknown) {
  return /store_fee_policies/i.test(String(m ?? "")) && /does not exist/i.test(String(m ?? ""));
}

function archivedColsMissing(m: unknown) {
  return /is_archived/i.test(String(m ?? "")) && /does not exist|unknown column/i.test(String(m ?? ""));
}

function topicColMissing(m: unknown) {
  return /topic_id/i.test(String(m ?? "")) && /does not exist|unknown column/i.test(String(m ?? ""));
}

function toEffective(row: StoreFeePolicyRow, scope: Exclude<StoreFeePolicyScope, "missing_policy">): EffectiveStoreFeePolicy {
  return {
    policyId: row.id,
    policyName: row.policy_name,
    feePercent: clampPercent(row.fee_percent),
    fixedFee: clampMoneyInt(row.fixed_fee),
    deliveryFeeMode: String(row.delivery_fee_mode ?? "none"),
    deliveryFeePercent: clampPercent(row.delivery_fee_percent),
    scope,
    snapshot: { ...row, scope, source: "store_fee_policies" },
  };
}

/** Explicit fail — never silent 0% / commerce_settings / env. */
export function missingStoreFeePolicy(reason: string): EffectiveStoreFeePolicy {
  return {
    policyId: null,
    policyName: "missing_policy",
    feePercent: 0,
    fixedFee: 0,
    deliveryFeeMode: "none",
    deliveryFeePercent: 0,
    scope: "missing_policy",
    snapshot: { source: "missing_policy", reason },
  };
}

export function isMissingStoreFeePolicy(policy: EffectiveStoreFeePolicy): boolean {
  return policy.scope === "missing_policy" || policy.policyName === "missing_policy";
}

type QueryResult =
  | { ok: true; row: StoreFeePolicyRow | null }
  | { ok: false; missing: boolean; archived_cols_missing?: boolean; topic_col_missing?: boolean };

async function runPolicyQuery(q: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<QueryResult> {
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return { ok: false, missing: true };
    if (archivedColsMissing(error.message)) return { ok: false, missing: false, archived_cols_missing: true };
    if (topicColMissing(error.message)) return { ok: false, missing: false, topic_col_missing: true };
    console.error("[resolveEffectiveStoreFeePolicy]", error);
    return { ok: false, missing: false };
  }
  const row = (Array.isArray(data) ? data[0] : null) as StoreFeePolicyRow | null | undefined;
  return { ok: true, row: row ?? null };
}

function activeWindowQuery(
  sb: SupabaseClient,
  opts: {
    storeId?: string | null;
    topicId?: string | null;
    categoryId?: string | null;
    requireNullStore?: boolean;
    requireNullTopic?: boolean;
    requireNullCategory?: boolean;
    includeArchivedFilter: boolean;
    select: string;
  }
) {
  const now = nowIso();
  let q = sb
    .from("store_fee_policies")
    .select(opts.select)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("priority", { ascending: true })
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (opts.includeArchivedFilter) q = q.eq("is_archived", false);
  if (opts.storeId) q = q.eq("store_id", opts.storeId);
  if (opts.topicId) q = q.eq("topic_id", opts.topicId);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.requireNullStore) q = q.is("store_id", null);
  if (opts.requireNullTopic) q = q.is("topic_id", null);
  if (opts.requireNullCategory) q = q.is("category_id", null);
  return q;
}

async function pickActivePolicy(
  sb: SupabaseClient,
  opts: {
    storeId?: string | null;
    topicId?: string | null;
    categoryId?: string | null;
    requireNullStore?: boolean;
    requireNullTopic?: boolean;
    requireNullCategory?: boolean;
  }
): Promise<QueryResult> {
  const withTopic = await runPolicyQuery(
    activeWindowQuery(sb, {
      ...opts,
      includeArchivedFilter: true,
      select: FEE_POLICY_SELECT,
    }) as any
  );
  if (withTopic.ok || withTopic.missing) return withTopic;

  if (withTopic.topic_col_missing) {
    const selectLegacy =
      "id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, store_id, category_id";
    if (opts.topicId && !opts.storeId && !opts.categoryId) {
      return { ok: true, row: null };
    }
    let res = await runPolicyQuery(
      activeWindowQuery(sb, {
        storeId: opts.storeId,
        categoryId: opts.categoryId,
        requireNullStore: opts.requireNullStore,
        requireNullCategory: opts.requireNullCategory,
        includeArchivedFilter: true,
        select: selectLegacy,
      }) as any
    );
    if (!res.ok && res.archived_cols_missing) {
      res = await runPolicyQuery(
        activeWindowQuery(sb, {
          storeId: opts.storeId,
          categoryId: opts.categoryId,
          requireNullStore: opts.requireNullStore,
          requireNullCategory: opts.requireNullCategory,
          includeArchivedFilter: false,
          select: selectLegacy,
        }) as any
      );
    }
    return res;
  }

  if (!withTopic.ok && withTopic.archived_cols_missing) {
    return runPolicyQuery(
      activeWindowQuery(sb, {
        ...opts,
        includeArchivedFilter: false,
        select: FEE_POLICY_SELECT,
      }) as any
    );
  }

  return withTopic;
}

/**
 * Resolve effective commission policy for a store at `at` (default now).
 * Single server authority — Admin / Owner / Settlement must use this.
 * Ends at Platform Default; never reads commerce_settings for fee authority.
 */
export async function resolveEffectiveStoreFeePolicy(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    storeCategoryId?: string | null;
    storeTopicId?: string | null;
  }
): Promise<EffectiveStoreFeePolicy> {
  const sid = opts.storeId.trim();
  if (!sid) return missingStoreFeePolicy("missing_store_id");

  let categoryId = opts.storeCategoryId?.trim() || null;
  let topicId = opts.storeTopicId?.trim() || null;

  if (categoryId === null || topicId === null) {
    const { data: storeRow } = await sb
      .from("stores")
      .select("id, store_category_id, store_topic_id")
      .eq("id", sid)
      .maybeSingle();
    if (storeRow) {
      if (!categoryId && typeof (storeRow as any).store_category_id === "string") {
        categoryId = String((storeRow as any).store_category_id).trim() || null;
      }
      if (!topicId && typeof (storeRow as any).store_topic_id === "string") {
        topicId = String((storeRow as any).store_topic_id).trim() || null;
      }
    }
  }

  // 1) store override
  {
    const res = await pickActivePolicy(sb, { storeId: sid });
    if (!res.ok) {
      if (res.missing) return missingStoreFeePolicy("store_fee_policies_table_missing");
    } else if (res.row) {
      return toEffective(res.row, "store");
    }
  }

  // 2) secondary category (topic)
  if (topicId) {
    const res = await pickActivePolicy(sb, {
      topicId,
      requireNullStore: true,
    });
    if (!res.ok) {
      if (res.missing) return missingStoreFeePolicy("store_fee_policies_table_missing");
    } else if (res.row) {
      return toEffective(res.row, "topic");
    }
  }

  // 3) primary category
  if (categoryId) {
    const res = await pickActivePolicy(sb, {
      categoryId,
      requireNullStore: true,
      requireNullTopic: true,
    });
    if (!res.ok) {
      if (res.missing) return missingStoreFeePolicy("store_fee_policies_table_missing");
    } else if (res.row) {
      return toEffective(res.row, "category");
    }
  }

  // 4) platform default — terminal authority
  {
    const res = await pickActivePolicy(sb, {
      requireNullStore: true,
      requireNullTopic: true,
      requireNullCategory: true,
    });
    if (!res.ok) {
      if (res.missing) return missingStoreFeePolicy("store_fee_policies_table_missing");
      return missingStoreFeePolicy("platform_default_query_failed");
    }
    if (res.row) {
      return toEffective(res.row, "default");
    }
  }

  return missingStoreFeePolicy("no_store_topic_category_or_platform_default");
}

export function buildAppliedFeePolicySnapshot(policy: EffectiveStoreFeePolicy): Record<string, unknown> {
  return {
    policy_name: policy.policyName,
    fee_percent: policy.feePercent,
    fixed_fee: policy.fixedFee,
    delivery_fee_mode: policy.deliveryFeeMode,
    delivery_fee_percent: policy.deliveryFeePercent,
    scope: policy.scope,
    source: policy.scope === "missing_policy" ? "missing_policy" : "store_fee_policies",
    raw: policy.snapshot,
  };
}
