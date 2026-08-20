import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
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

/** Admin fee-policy cockpit — same resolver as settlement; no second engine. */
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
        "id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, is_archived, starts_at, ends_at, priority, memo"
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
        "id, store_id, order_id, gross_amount, platform_fee_percent, platform_fee_amount, fixed_fee_amount, applied_fee_policy_id, applied_fee_policy_snapshot, settlement_status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(12),
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

  const categoryPolicies = categories.map((c) => {
    const pol = pickActive(policies, (r) => !r.store_id && !r.topic_id && r.category_id === c.id);
    return {
      category_id: c.id,
      name: c.name,
      slug: c.slug,
      is_active: Boolean(c.is_active),
      store_count: stores.filter((s) => s.store_category_id === c.id).length,
      policy: pol
        ? {
            id: pol.id,
            policy_name: pol.policy_name,
            fee_percent: Number(pol.fee_percent) || 0,
            fixed_fee: Math.round(Number(pol.fixed_fee) || 0),
            priority: pol.priority,
          }
        : null,
    };
  });

  const topicPolicies = topics.map((tp) => {
    const pol = pickActive(policies, (r) => !r.store_id && r.topic_id === tp.id);
    return {
      topic_id: tp.id,
      category_id: tp.store_category_id,
      name: tp.name,
      slug: tp.slug,
      is_active: Boolean(tp.is_active),
      store_count: stores.filter((s) => s.store_topic_id === tp.id).length,
      policy: pol
        ? {
            id: pol.id,
            policy_name: pol.policy_name,
            fee_percent: Number(pol.fee_percent) || 0,
            fixed_fee: Math.round(Number(pol.fixed_fee) || 0),
            priority: pol.priority,
          }
        : null,
    };
  });

  const storeRows: Array<{
    store_id: string;
    store_name: string;
    slug: string | null;
    category_id: string | null;
    category_name: string | null;
    topic_id: string | null;
    topic_name: string | null;
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

  const nowMs = Date.now();
  const scheduled = policies
    .filter((r) => {
      if (!r.is_active || r.is_archived) return false;
      if (!r.starts_at) return false;
      const t = new Date(r.starts_at).getTime();
      return Number.isFinite(t) && t > nowMs;
    })
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())
    .slice(0, 20)
    .map((r) => {
      const sc = scopeOf(r);
      let target_label = r.policy_name;
      if (sc === "store" && r.store_id) {
        const st = storeById.get(r.store_id);
        target_label = String(st?.store_name ?? r.store_id);
      } else if (sc === "topic" && r.topic_id) {
        const tp = topicById.get(r.topic_id);
        const cat = tp ? catById.get(tp.store_category_id) : null;
        target_label = cat ? `${cat.name} > ${tp?.name}` : String(tp?.name ?? r.topic_id);
      } else if (sc === "category" && r.category_id) {
        target_label = String(catById.get(r.category_id)?.name ?? r.category_id);
      } else if (sc === "default") {
        target_label = "Platform Default";
      }
      return {
        id: r.id,
        scope: sc,
        target_label,
        fee_percent: Number(r.fee_percent) || 0,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        policy_name: r.policy_name,
      };
    });

  const verification = settlements.map((s) => {
    const gross = Math.round(Number(s.gross_amount) || 0);
    const rate = Number(s.platform_fee_percent) || 0;
    const fee = Math.round(Number(s.platform_fee_amount) || 0);
    const expected = Math.floor((gross * rate) / 100);
    const snap =
      s.applied_fee_policy_snapshot && typeof s.applied_fee_policy_snapshot === "object"
        ? (s.applied_fee_policy_snapshot as Record<string, unknown>)
        : null;
    const snapRate =
      snap && snap.fee_percent != null ? Number(snap.fee_percent) : null;
    const st = storeById.get(String(s.store_id ?? ""));
    return {
      settlement_id: String(s.id).slice(0, 8),
      order_id: String(s.order_id ?? "").slice(0, 8),
      store_name: st ? String(st.store_name ?? "") : String(s.store_id ?? "").slice(0, 8),
      gross_amount: gross,
      policy_fee_percent: snapRate,
      settlement_fee_percent: rate,
      calculated_fee_amount: expected,
      settlement_fee_amount: fee,
      matched: fee === expected && (snapRate == null || snapRate === rate),
      settlement_status: s.settlement_status,
      created_at: s.created_at,
    };
  });

  const storesTotal = stores.length || 1;
  const appliedBusiness = countCategory + countTopic;

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
    categories: categoryPolicies,
    topics: topicPolicies,
    stores: storeRows,
    scheduled_changes: scheduled,
    verification,
    settlements_error: setRes.error?.message ?? null,
  });
}
