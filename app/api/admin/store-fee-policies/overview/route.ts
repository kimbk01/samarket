import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  calculateOrderCommission,
  isMissingStoreFeePolicy,
  resolveEffectiveStoreFeePolicy,
  type StoreFeePolicyScope,
} from "@/lib/stores/store-fee-policy-resolve";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PolicyLite = {
  id: string;
  policy_name: string;
  store_id: string | null;
  category_id: string | null;
  topic_id: string | null;
  fee_percent: number;
  fixed_fee: number;
  delivery_fee_mode: string;
  delivery_fee_percent: number;
  is_active: boolean;
  is_archived: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  memo: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function inWindow(row: PolicyLite, nowMs: number): boolean {
  if (row.starts_at) {
    const t = new Date(row.starts_at).getTime();
    if (Number.isFinite(t) && t > nowMs) return false;
  }
  if (row.ends_at) {
    const t = new Date(row.ends_at).getTime();
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  return true;
}

function pickActive(rows: PolicyLite[], pred: (r: PolicyLite) => boolean): PolicyLite | null {
  const nowMs = Date.now();
  const matched = rows
    .filter((r) => r.is_active && !r.is_archived && inWindow(r, nowMs) && pred(r))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aStart = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const bStart = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      if (aStart !== bStart) return bStart - aStart;
      return 0;
    });
  return matched[0] ?? null;
}

function rateOf(row: PolicyLite | null): {
  fee_percent: number | null;
  fixed_fee: number | null;
  policy_id: string | null;
  policy_name: string | null;
  starts_at: string | null;
  memo: string | null;
} {
  if (!row) {
    return {
      fee_percent: null,
      fixed_fee: null,
      policy_id: null,
      policy_name: null,
      starts_at: null,
      memo: null,
    };
  }
  return {
    fee_percent: Number(row.fee_percent) || 0,
    fixed_fee: Math.round(Number(row.fixed_fee) || 0),
    policy_id: row.id,
    policy_name: row.policy_name,
    starts_at: row.starts_at,
    memo: typeof row.memo === "string" ? row.memo : null,
  };
}

function scopeOf(r: PolicyLite): "store" | "topic" | "category" | "default" {
  if (r.store_id) return "store";
  if (r.topic_id) return "topic";
  if (r.category_id) return "category";
  return "default";
}

function targetLabel(
  r: PolicyLite,
  storeById: Map<string, { store_name?: string | null }>,
  catById: Map<string, { name?: string | null }>,
  topicById: Map<string, { name?: string | null; store_category_id: string }>
): string {
  const sc = scopeOf(r);
  if (sc === "store" && r.store_id) {
    return String(storeById.get(r.store_id)?.store_name ?? r.store_id);
  }
  if (sc === "topic" && r.topic_id) {
    const tp = topicById.get(r.topic_id);
    const cat = tp ? catById.get(tp.store_category_id) : null;
    return cat ? `${cat.name} > ${tp?.name}` : String(tp?.name ?? r.topic_id);
  }
  if (sc === "category" && r.category_id) {
    return String(catById.get(r.category_id)?.name ?? r.category_id);
  }
  return "Platform Default";
}

/**
 * Admin fee-policy cockpit overview.
 * Same resolver as settlement — no second engine.
 * Industry “apply all” = one category/topic policy row; store overrides still win.
 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const [polRes, catRes, topicRes, storeRes, setRes] = await Promise.all([
    sb
      .from("store_fee_policies")
      .select(
        "id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, is_archived, starts_at, ends_at, priority, memo, created_at, updated_at"
      )
      .limit(500),
    sb.from("store_categories").select("id, name, slug, is_active").order("name").limit(100),
    sb
      .from("store_topics")
      .select("id, name, slug, store_category_id, is_active")
      .order("name")
      .limit(300),
    sb
      .from("stores")
      .select("id, store_name, slug, store_category_id, store_topic_id")
      .order("store_name")
      .limit(2000),
    sb
      .from("store_settlements")
      .select(
        "id, store_id, order_id, gross_amount, platform_fee_percent, platform_fee_amount, fixed_fee_amount, delivery_fee_amount, applied_fee_policy_id, applied_fee_policy_snapshot, settlement_status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (polRes.error) {
    if (
      polRes.error.message?.includes("store_fee_policies") &&
      polRes.error.message.includes("does not exist")
    ) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin store-fee-policies/overview] policies", polRes.error);
    return NextResponse.json({ ok: false, error: polRes.error.message }, { status: 500 });
  }
  if (catRes.error) {
    return NextResponse.json({ ok: false, error: catRes.error.message }, { status: 500 });
  }
  if (topicRes.error) {
    return NextResponse.json({ ok: false, error: topicRes.error.message }, { status: 500 });
  }
  if (storeRes.error) {
    return NextResponse.json({ ok: false, error: storeRes.error.message }, { status: 500 });
  }

  const policies = (polRes.data ?? []) as PolicyLite[];
  const categories = catRes.data ?? [];
  const topics = topicRes.data ?? [];
  const stores = storeRes.data ?? [];
  const settlements = setRes.error ? [] : (setRes.data ?? []);

  const platform = pickActive(policies, (r) => !r.store_id && !r.category_id && !r.topic_id);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const topicById = new Map(topics.map((tp) => [tp.id, tp]));
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const storeRows: Array<{
    store_id: string;
    store_name: string;
    slug: string | null;
    category_id: string | null;
    category_name: string | null;
    topic_id: string | null;
    topic_name: string | null;
    has_store_override: boolean;
    ladder: {
      platform: ReturnType<typeof rateOf>;
      category: ReturnType<typeof rateOf>;
      topic: ReturnType<typeof rateOf>;
      store: ReturnType<typeof rateOf>;
    };
    effective: {
      fee_percent: number;
      fixed_fee: number;
      scope: StoreFeePolicyScope;
      policy_id: string | null;
      policy_name: string;
      missing: boolean;
    };
  }> = [];

  let countDefault = 0;
  let countCategory = 0;
  let countTopic = 0;
  let countStore = 0;
  let countMissing = 0;

  for (const s of stores) {
    const sid = String(s.id);
    const categoryId =
      typeof s.store_category_id === "string" ? s.store_category_id.trim() || null : null;
    const topicId = typeof s.store_topic_id === "string" ? s.store_topic_id.trim() || null : null;
    const storePol = pickActive(policies, (r) => r.store_id === sid);
    const topicPol = topicId
      ? pickActive(policies, (r) => !r.store_id && r.topic_id === topicId)
      : null;
    const catPol = categoryId
      ? pickActive(policies, (r) => !r.store_id && !r.topic_id && r.category_id === categoryId)
      : null;

    const resolved = await resolveEffectiveStoreFeePolicy(sb, {
      storeId: sid,
      storeCategoryId: categoryId,
      storeTopicId: topicId,
    });
    const missing = isMissingStoreFeePolicy(resolved);
    if (missing) countMissing += 1;
    else if (resolved.scope === "store") countStore += 1;
    else if (resolved.scope === "topic") countTopic += 1;
    else if (resolved.scope === "category") countCategory += 1;
    else if (resolved.scope === "default") countDefault += 1;

    storeRows.push({
      store_id: sid,
      store_name: String(s.store_name ?? "").trim() || sid,
      slug: typeof s.slug === "string" ? s.slug : null,
      category_id: categoryId,
      category_name: categoryId ? (catById.get(categoryId)?.name ?? null) : null,
      topic_id: topicId,
      topic_name: topicId ? (topicById.get(topicId)?.name ?? null) : null,
      has_store_override: Boolean(storePol),
      ladder: {
        platform: rateOf(platform),
        category: rateOf(catPol),
        topic: rateOf(topicPol),
        store: rateOf(storePol),
      },
      effective: {
        fee_percent: resolved.feePercent,
        fixed_fee: resolved.fixedFee,
        scope: resolved.scope,
        policy_id: resolved.policyId,
        policy_name: resolved.policyName,
        missing,
      },
    });
  }

  const categoryPolicies = categories.map((c) => {
    const pol = pickActive(policies, (r) => !r.store_id && !r.topic_id && r.category_id === c.id);
    const inCat = storeRows.filter((s) => s.category_id === c.id);
    const overrideCount = inCat.filter((s) => s.has_store_override).length;
    const topicWinsCount = inCat.filter(
      (s) => !s.has_store_override && s.ladder.topic.policy_id != null
    ).length;
    const wouldApplyCount = Math.max(0, inCat.length - overrideCount - topicWinsCount);
    return {
      category_id: c.id,
      name: c.name,
      slug: c.slug,
      is_active: Boolean(c.is_active),
      store_count: inCat.length,
      override_store_count: overrideCount,
      topic_wins_store_count: topicWinsCount,
      would_apply_store_count: wouldApplyCount,
      policy: pol
        ? {
            id: pol.id,
            policy_name: pol.policy_name,
            fee_percent: Number(pol.fee_percent) || 0,
            fixed_fee: Math.round(Number(pol.fixed_fee) || 0),
            priority: pol.priority,
            starts_at: pol.starts_at,
            ends_at: pol.ends_at,
            memo: pol.memo,
          }
        : null,
    };
  });

  const topicPolicies = topics.map((tp) => {
    const pol = pickActive(policies, (r) => !r.store_id && r.topic_id === tp.id);
    const inTopic = storeRows.filter((s) => s.topic_id === tp.id);
    const overrideCount = inTopic.filter((s) => s.has_store_override).length;
    const wouldApplyCount = Math.max(0, inTopic.length - overrideCount);
    return {
      topic_id: tp.id,
      category_id: tp.store_category_id,
      name: tp.name,
      slug: tp.slug,
      is_active: Boolean(tp.is_active),
      store_count: inTopic.length,
      override_store_count: overrideCount,
      would_apply_store_count: wouldApplyCount,
      policy: pol
        ? {
            id: pol.id,
            policy_name: pol.policy_name,
            fee_percent: Number(pol.fee_percent) || 0,
            fixed_fee: Math.round(Number(pol.fixed_fee) || 0),
            priority: pol.priority,
            starts_at: pol.starts_at,
            ends_at: pol.ends_at,
            memo: pol.memo,
          }
        : null,
    };
  });

  const nowMs = Date.now();
  const scheduled = policies
    .filter((r) => {
      if (!r.is_active || r.is_archived) return false;
      if (!r.starts_at) return false;
      const t = new Date(r.starts_at).getTime();
      return Number.isFinite(t) && t > nowMs;
    })
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())
    .slice(0, 40)
    .map((r) => ({
      id: r.id,
      scope: scopeOf(r),
      target_label: targetLabel(r, storeById, catById, topicById),
      fee_percent: Number(r.fee_percent) || 0,
      fixed_fee: Math.round(Number(r.fixed_fee) || 0),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      policy_name: r.policy_name,
      memo: r.memo,
    }));

  const policyHistory = [...policies]
    .sort((a, b) => {
      const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bu - au;
    })
    .slice(0, 60)
    .map((r) => ({
      id: r.id,
      scope: scopeOf(r),
      target_label: targetLabel(r, storeById, catById, topicById),
      fee_percent: Number(r.fee_percent) || 0,
      fixed_fee: Math.round(Number(r.fixed_fee) || 0),
      is_active: Boolean(r.is_active),
      is_archived: Boolean(r.is_archived),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      memo: r.memo,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
      policy_name: r.policy_name,
    }));

  const verification = settlements.map((s) => {
    const gross = Math.round(Number(s.gross_amount) || 0);
    const rate = Number(s.platform_fee_percent) || 0;
    const fee = Math.round(Number(s.platform_fee_amount) || 0);
    const fixedSettled = Math.round(Number(s.fixed_fee_amount) || 0);
    const deliveryAmt = Math.round(Number((s as { delivery_fee_amount?: number }).delivery_fee_amount) || 0);
    const snap =
      s.applied_fee_policy_snapshot && typeof s.applied_fee_policy_snapshot === "object"
        ? (s.applied_fee_policy_snapshot as Record<string, unknown>)
        : null;
    const snapRate = snap && snap.fee_percent != null ? Number(snap.fee_percent) : null;
    const snapFixed =
      snap && snap.fixed_fee != null ? Math.round(Number(snap.fixed_fee) || 0) : fixedSettled;
    const snapDeliveryMode =
      snap && typeof snap.delivery_fee_mode === "string" ? snap.delivery_fee_mode : "none";
    const snapDeliveryPct =
      snap && snap.delivery_fee_percent != null ? Number(snap.delivery_fee_percent) : 0;
    const calc = calculateOrderCommission({
      commissionBaseAmount: gross,
      deliveryFeeAmount: deliveryAmt,
      feePercent: snapRate != null && Number.isFinite(snapRate) ? snapRate : rate,
      fixedFee: snapFixed,
      deliveryFeeMode: snapDeliveryMode,
      deliveryFeePercent: snapDeliveryPct,
    });
    const calculatedTotal = calc.platformFeeAmount + calc.fixedFeeAmount;
    const settlementTotal = fee + fixedSettled;
    const st = storeById.get(String(s.store_id ?? ""));
    return {
      settlement_id: String(s.id),
      settlement_id_short: String(s.id).slice(0, 8),
      order_id: String(s.order_id ?? ""),
      order_id_short: String(s.order_id ?? "").slice(0, 8),
      store_id: String(s.store_id ?? ""),
      store_name: st ? String(st.store_name ?? "") : String(s.store_id ?? "").slice(0, 8),
      gross_amount: gross,
      policy_fee_percent: snapRate,
      settlement_fee_percent: rate,
      calculated_fee_amount: calculatedTotal,
      settlement_fee_amount: settlementTotal,
      matched:
        settlementTotal === calculatedTotal && (snapRate == null || snapRate === rate),
      settlement_status: s.settlement_status,
      created_at: s.created_at,
      applied_fee_policy_id: s.applied_fee_policy_id ?? null,
    };
  });

  const storesTotal = stores.length || 1;
  const appliedBusiness = countCategory + countTopic;
  const mismatchCount = verification.filter((v) => !v.matched).length;

  return NextResponse.json({
    ok: true,
    summary: {
      stores_total: stores.length,
      applied_default: countDefault,
      applied_category: countCategory,
      applied_topic: countTopic,
      applied_business: appliedBusiness,
      applied_store: countStore,
      missing_policy: countMissing,
      reserved_future: scheduled.length,
      inactive_policies: policies.filter((r) => !r.is_active && !r.is_archived).length,
      verification_mismatch: mismatchCount,
      pct_business: Math.round((appliedBusiness / storesTotal) * 1000) / 10,
      pct_store: Math.round((countStore / storesTotal) * 1000) / 10,
      pct_default: Math.round((countDefault / storesTotal) * 1000) / 10,
    },
    platform_default: platform
      ? {
          id: platform.id,
          policy_name: platform.policy_name,
          fee_percent: Number(platform.fee_percent) || 0,
          fixed_fee: Math.round(Number(platform.fixed_fee) || 0),
          delivery_fee_mode: platform.delivery_fee_mode,
          delivery_fee_percent: Number(platform.delivery_fee_percent) || 0,
          priority: platform.priority,
          starts_at: platform.starts_at,
          ends_at: platform.ends_at,
          memo: platform.memo,
        }
      : null,
    apply_semantics: {
      industry_mode: "policy_row_upsert",
      store_override_wins: true,
      note: "Industry policy does not overwrite active store overrides.",
    },
    categories: categoryPolicies,
    topics: topicPolicies,
    stores: storeRows,
    scheduled_changes: scheduled,
    policy_history: policyHistory,
    verification,
    settlements_error: setRes.error?.message ?? null,
  });
}
