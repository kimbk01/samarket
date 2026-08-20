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

function pickActive(
  rows: PolicyLite[],
  pred: (r: PolicyLite) => boolean
): PolicyLite | null {
  const nowMs = Date.now();
  const matched = rows
    .filter(
      (r) =>
        r.is_active &&
        !r.is_archived &&
        inWindow(r, nowMs) &&
        pred(r)
    )
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
} {
  if (!row) {
    return { fee_percent: null, fixed_fee: null, policy_id: null, policy_name: null };
  }
  return {
    fee_percent: Number(row.fee_percent) || 0,
    fixed_fee: Math.round(Number(row.fixed_fee) || 0),
    policy_id: row.id,
    policy_name: row.policy_name,
  };
}

/** Admin IA overview — same resolver as settlement; no second engine. */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const [polRes, catRes, topicRes, storeRes] = await Promise.all([
    sb
      .from("store_fee_policies")
      .select(
        "id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, is_archived, starts_at, ends_at, priority"
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
    console.error("[admin store-fee-policies/overview] categories", catRes.error);
    return NextResponse.json({ ok: false, error: catRes.error.message }, { status: 500 });
  }
  if (topicRes.error) {
    console.error("[admin store-fee-policies/overview] topics", topicRes.error);
    return NextResponse.json({ ok: false, error: topicRes.error.message }, { status: 500 });
  }
  if (storeRes.error) {
    console.error("[admin store-fee-policies/overview] stores", storeRes.error);
    return NextResponse.json({ ok: false, error: storeRes.error.message }, { status: 500 });
  }

  const policies = (polRes.data ?? []) as PolicyLite[];
  const categories = catRes.data ?? [];
  const topics = topicRes.data ?? [];
  const stores = storeRes.data ?? [];

  const platform = pickActive(
    policies,
    (r) => !r.store_id && !r.category_id && !r.topic_id
  );

  const categoryPolicies = categories.map((c) => {
    const pol = pickActive(
      policies,
      (r) => !r.store_id && !r.topic_id && r.category_id === c.id
    );
    const storeCount = stores.filter((s) => s.store_category_id === c.id).length;
    return {
      category_id: c.id,
      name: c.name,
      slug: c.slug,
      is_active: Boolean(c.is_active),
      store_count: storeCount,
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
    const storeCount = stores.filter((s) => s.store_topic_id === tp.id).length;
    return {
      topic_id: tp.id,
      category_id: tp.store_category_id,
      name: tp.name,
      slug: tp.slug,
      is_active: Boolean(tp.is_active),
      store_count: storeCount,
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
    const topicId =
      typeof s.store_topic_id === "string" ? s.store_topic_id.trim() || null : null;
    const catName =
      categories.find((c) => c.id === categoryId)?.name ?? null;
    const topicName = topics.find((tp) => tp.id === topicId)?.name ?? null;

    const storePol = pickActive(policies, (r) => r.store_id === sid);
    const topicPol = topicId
      ? pickActive(policies, (r) => !r.store_id && r.topic_id === topicId)
      : null;
    const catPol = categoryId
      ? pickActive(
          policies,
          (r) => !r.store_id && !r.topic_id && r.category_id === categoryId
        )
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
      category_name: catName,
      topic_id: topicId,
      topic_name: topicName,
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
  const reserved = policies.filter((r) => {
    if (!r.is_active || r.is_archived) return false;
    if (!r.starts_at) return false;
    const t = new Date(r.starts_at).getTime();
    return Number.isFinite(t) && t > nowMs;
  }).length;

  return NextResponse.json({
    ok: true,
    summary: {
      stores_total: stores.length,
      applied_default: countDefault,
      applied_category: countCategory,
      applied_topic: countTopic,
      applied_store: countStore,
      missing_policy: countMissing,
      reserved_future: reserved,
      inactive_policies: policies.filter((r) => !r.is_active && !r.is_archived).length,
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
        }
      : null,
    categories: categoryPolicies,
    topics: topicPolicies,
    stores: storeRows,
  });
}
