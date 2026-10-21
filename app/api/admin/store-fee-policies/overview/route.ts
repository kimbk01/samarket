import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { calculateOrderCommission, type StoreFeePolicyScope } from "@/lib/stores/store-fee-policy-resolve";
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
      // store_commission_resolve_policy 와 같은 순서: priority ASC, starts_at DESC NULLS FIRST, created_at DESC
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
      const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return bStart > aStart ? 1 : -1;
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
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
  updated_at: string | null;
} {
  if (!row) {
    return {
      fee_percent: null,
      fixed_fee: null,
      policy_id: null,
      policy_name: null,
      starts_at: null,
      memo: null,
      updated_at: null,
    };
  }
  return {
    fee_percent: Number(row.fee_percent) || 0,
    fixed_fee: Math.round(Number(row.fixed_fee) || 0),
    policy_id: row.id,
    policy_name: row.policy_name,
    starts_at: row.starts_at,
    memo: typeof row.memo === "string" ? row.memo : null,
    updated_at: row.updated_at ?? null,
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

/** PostgREST 한 번 응답 상한(기본 1000)과 무관하게 끝까지 읽는다 — 고정 상한 없음 (R7). */
const PAGE_READ = 1000;
async function readAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
): Promise<{ data: T[]; error: { message?: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_READ) {
    const { data, error } = await run(from, from + PAGE_READ - 1);
    if (error) return { data: out, error };
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_READ) return { data: out, error: null };
  }
}

const POLICY_SELECT =
  "id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, is_archived, starts_at, ends_at, priority, memo, created_at, updated_at";

type LadderPolicyJson = {
  policy_id?: string | null;
  policy_name?: string | null;
  fee_percent?: number | string | null;
  fixed_fee?: number | string | null;
  starts_at?: string | null;
  memo?: string | null;
  updated_at?: string | null;
} | null;

function rateOfJson(row: LadderPolicyJson): ReturnType<typeof rateOf> {
  if (!row || !row.policy_id) return rateOf(null);
  return {
    fee_percent: Number(row.fee_percent) || 0,
    fixed_fee: Math.round(Number(row.fixed_fee) || 0),
    policy_id: String(row.policy_id),
    policy_name: row.policy_name ?? null,
    starts_at: row.starts_at ?? null,
    memo: typeof row.memo === "string" ? row.memo : null,
    updated_at: row.updated_at ?? null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_PAGE_MAX = 100;

/**
 * 매장 탭 서버 페이지 (R7) — `?section=stores&q=&cat=&limit=&offset=`.
 * 검색·업종 필터·정렬(store_name, id)·전체 건수는 DB `admin_store_fee_store_page`, 유효 정책은 SSOT 함수
 * `store_commission_resolve_policy` (정산과 같은 해석기).
 */
async function loadStoresSection(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  sp: URLSearchParams
) {
  const limitRaw = Math.floor(Number(sp.get("limit")));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(STORE_PAGE_MAX, limitRaw) : 20;
  const offsetRaw = Math.floor(Number(sp.get("offset")));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const cat = String(sp.get("cat") ?? "").trim();
  const q = String(sp.get("q") ?? "").trim();
  const [pageRes, platformRes] = await Promise.all([
    sb.rpc("admin_store_fee_store_page", {
      p_q: q || null,
      p_category_id: UUID_RE.test(cat) ? cat : null,
      p_limit: limit,
      p_offset: offset,
    }),
    sb.rpc("admin_store_fee_active_policy_json", {
      p_store_id: null,
      p_topic_id: null,
      p_category_id: null,
      p_level: "default",
    }),
  ]);
  if (pageRes.error) {
    console.error("[admin store-fee-policies/overview] store page", pageRes.error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  const payload = (pageRes.data ?? {}) as { total?: number; rows?: Record<string, unknown>[] };
  const platformRate = rateOfJson(platformRes.error ? null : (platformRes.data as LadderPolicyJson));
  const stores = (payload.rows ?? []).map((r) => {
    const sid = String(r.store_id ?? "");
    const eff = (r.effective ?? null) as Record<string, unknown> | null;
    const missing = !eff;
    const storeRate = rateOfJson(r.store_policy as LadderPolicyJson);
    return {
      store_id: sid,
      store_name: String(r.store_name ?? "").trim() || sid,
      slug: typeof r.slug === "string" ? r.slug : null,
      category_id: typeof r.category_id === "string" ? r.category_id : null,
      category_name: typeof r.category_name === "string" ? r.category_name : null,
      topic_id: typeof r.topic_id === "string" ? r.topic_id : null,
      topic_name: typeof r.topic_name === "string" ? r.topic_name : null,
      has_store_override: Boolean(storeRate.policy_id),
      ladder: {
        platform: platformRate,
        category: rateOfJson(r.category_policy as LadderPolicyJson),
        topic: rateOfJson(r.topic_policy as LadderPolicyJson),
        store: storeRate,
      },
      effective: missing
        ? {
            fee_percent: 0,
            fixed_fee: 0,
            scope: "missing_policy" as StoreFeePolicyScope,
            policy_id: null,
            policy_name: "missing_policy",
            missing: true,
          }
        : {
            fee_percent: Number(eff.fee_percent) || 0,
            fixed_fee: Math.round(Number(eff.fixed_fee) || 0),
            scope: String(eff.scope ?? "default") as StoreFeePolicyScope,
            policy_id: eff.policy_id ? String(eff.policy_id) : null,
            policy_name: String(eff.policy_name ?? ""),
            missing: false,
          },
    };
  });
  return NextResponse.json({
    ok: true,
    stores,
    total: Math.max(0, Math.floor(Number(payload.total) || 0)),
    limit,
    offset,
  });
}

/**
 * Admin fee-policy cockpit overview.
 * Same resolver as settlement — no second engine (DB `store_commission_resolve_policy`).
 * Industry “apply all” = one category/topic policy row; store overrides still win.
 * R7: 매장 수 집계는 DB `admin_store_fee_overview_summary` (전체 매장), 매장 목록은 `?section=stores` 서버 페이지.
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const sp = new URL(req.url).searchParams;
  if (sp.get("section") === "stores") {
    return loadStoresSection(sb, sp);
  }
  // B-2: 화면은 조회 가능, 변경 CTA 는 super_admin 만 (서버 쓰기 API 도 requireSuperAdmin).
  const actorGate = await requireAdminApiActor().catch(() => null);
  const canEditFeePolicy = Boolean(actorGate && actorGate.ok && actorGate.actor.isSuperAdmin);

  const nowIso = new Date().toISOString();
  const [polRes, catRes, topicRes, schedRes, histRes, summaryRes, setRes] = await Promise.all([
    // 업종·세부업종·플랫폼 기본 정책 (매장 개별 정책은 매장 탭 페이지·요약 함수가 다룬다)
    readAllPages<PolicyLite>((from, to) =>
      sb.from("store_fee_policies").select(POLICY_SELECT).is("store_id", null).order("id").range(from, to)
    ),
    readAllPages<{ id: string; name: string; slug: string; is_active: boolean }>((from, to) =>
      sb.from("store_categories").select("id, name, slug, is_active").order("name").order("id").range(from, to)
    ),
    readAllPages<{ id: string; name: string; slug: string; store_category_id: string; is_active: boolean }>(
      (from, to) =>
        sb
          .from("store_topics")
          .select("id, name, slug, store_category_id, is_active")
          .order("name")
          .order("id")
          .range(from, to)
    ),
    // 예약 변경 = 시작 전 활성 정책 전부 (매장 개별 포함)
    readAllPages<PolicyLite>((from, to) =>
      sb
        .from("store_fee_policies")
        .select(POLICY_SELECT)
        .eq("is_active", true)
        .eq("is_archived", false)
        .gt("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .order("id")
        .range(from, to)
    ),
    // 최근 변경 60건 (표시용 최근 목록 — DB 정렬)
    sb
      .from("store_fee_policies")
      .select(POLICY_SELECT)
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(60),
    sb.rpc("admin_store_fee_overview_summary"),
    // FIN-07: verification sample = commissions actually charged (frozen fee_snapshot at charge time),
    // not legacy store_settlements snapshots (stopped 2026-09-15).
    sb
      .from("store_sale_fee_obligations")
      .select("id, store_id, order_id, confirmed_revenue_php, fee_due_minor, original_fee_due_minor, fee_snapshot, status, created_at")
      .not("fee_snapshot", "is", null)
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
  if (summaryRes.error) {
    console.error("[admin store-fee-policies/overview] summary", summaryRes.error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const policies = polRes.data;
  const categories = catRes.data;
  const topics = topicRes.data;
  const scheduledRows = schedRes.error ? [] : schedRes.data;
  const historyRows = (histRes.error ? [] : (histRes.data ?? [])) as PolicyLite[];
  const settlements = setRes.error ? [] : (setRes.data ?? []);
  const summary = (summaryRes.data ?? {}) as {
    stores_total?: number;
    applied_default?: number;
    applied_category?: number;
    applied_topic?: number;
    applied_store?: number;
    missing_policy?: number;
    reserved_future?: number;
    inactive_policies?: number;
    categories?: Record<string, { store_count?: number; override_store_count?: number; topic_wins_store_count?: number }>;
    topics?: Record<string, { store_count?: number; override_store_count?: number }>;
  };
  const cnt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

  const platform = pickActive(policies, (r) => !r.store_id && !r.category_id && !r.topic_id);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const topicById = new Map(topics.map((tp) => [tp.id, tp]));

  // 표시 라벨용 매장 이름 — 예약·최근 변경·검증 표본에 나오는 매장만 (id 로 조회, 상한 없음)
  const labelStoreIds = [
    ...new Set(
      [
        ...scheduledRows.map((r) => r.store_id),
        ...historyRows.map((r) => r.store_id),
        ...settlements.map((s) => (s as { store_id?: string | null }).store_id),
      ].filter((v): v is string => typeof v === "string" && v.length > 0)
    ),
  ];
  const storeById = new Map<string, { store_name?: string | null }>();
  for (let i = 0; i < labelStoreIds.length; i += 200) {
    const { data } = await sb
      .from("stores")
      .select("id, store_name")
      .in("id", labelStoreIds.slice(i, i + 200));
    for (const s of data ?? []) storeById.set(String((s as { id: string }).id), s as { store_name?: string | null });
  }

  const categoryPolicies = categories.map((c) => {
    const pol = pickActive(policies, (r) => !r.store_id && !r.topic_id && r.category_id === c.id);
    const counts = summary.categories?.[c.id] ?? {};
    const storeCount = cnt(counts.store_count);
    const overrideCount = cnt(counts.override_store_count);
    const topicWinsCount = cnt(counts.topic_wins_store_count);
    const wouldApplyCount = Math.max(0, storeCount - overrideCount - topicWinsCount);
    return {
      category_id: c.id,
      name: c.name,
      slug: c.slug,
      is_active: Boolean(c.is_active),
      store_count: storeCount,
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
            updated_at: pol.updated_at ?? null,
            memo: pol.memo,
          }
        : null,
    };
  });

  const topicPolicies = topics.map((tp) => {
    const pol = pickActive(policies, (r) => !r.store_id && r.topic_id === tp.id);
    const counts = summary.topics?.[tp.id] ?? {};
    const storeCount = cnt(counts.store_count);
    const overrideCount = cnt(counts.override_store_count);
    const wouldApplyCount = Math.max(0, storeCount - overrideCount);
    return {
      topic_id: tp.id,
      category_id: tp.store_category_id,
      name: tp.name,
      slug: tp.slug,
      is_active: Boolean(tp.is_active),
      store_count: storeCount,
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
            updated_at: pol.updated_at ?? null,
            memo: pol.memo,
          }
        : null,
    };
  });

  const scheduled = scheduledRows.map((r) => ({
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

  const policyHistory = historyRows.map((r) => ({
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
    const snap =
      s.fee_snapshot && typeof s.fee_snapshot === "object" ? (s.fee_snapshot as Record<string, unknown>) : {};
    const policy =
      snap.policy && typeof snap.policy === "object" ? (snap.policy as Record<string, unknown>) : {};
    const int = (v: unknown) => Math.round(Number(v) || 0);
    const gross = int(snap.commission_base_php ?? s.confirmed_revenue_php);
    // Charged at cooking start (store_commission_charge_order_internal) — frozen components.
    const chargedPercent = Number(snap.fee_percent) || 0;
    const chargedPercentFee = int(snap.platform_fee_php);
    const chargedFixed = int(snap.fixed_fee_php);
    const chargedDeliveryIncome = int(snap.delivery_income_php);
    const chargedTotal = Math.round(
      Number(s.original_fee_due_minor ?? s.fee_due_minor ?? Number(snap.fee_due_php) * 100) / 100
    );
    // Rebuild from the policy frozen in the snapshot.
    const policyPercent = policy.fee_percent != null ? Number(policy.fee_percent) : null;
    const policyFixed = int(policy.fixed_fee);
    const calc = calculateOrderCommission({
      commissionBaseAmount: gross,
      deliveryFeeAmount: int(snap.delivery_fee_php),
      feePercent: policyPercent != null && Number.isFinite(policyPercent) ? policyPercent : chargedPercent,
      fixedFee: policyFixed,
      deliveryFeeMode: typeof policy.delivery_fee_mode === "string" ? policy.delivery_fee_mode : "none",
      deliveryFeePercent: Number(policy.delivery_fee_percent) || 0,
    });
    const calculatedTotal = calc.totalPlatformFeeAmount + calc.deliveryIncomeAmount;
    const st = storeById.get(String(s.store_id ?? ""));
    return {
      settlement_id: String(s.id),
      settlement_id_short: String(s.id).slice(0, 8),
      order_id: String(s.order_id ?? ""),
      order_id_short: String(s.order_id ?? "").slice(0, 8),
      store_id: String(s.store_id ?? ""),
      store_name: st ? String(st.store_name ?? "") : String(s.store_id ?? "").slice(0, 8),
      gross_amount: gross,
      policy_fee_percent: policyPercent != null && Number.isFinite(policyPercent) ? policyPercent : chargedPercent,
      policy_fixed_fee: policyFixed,
      settlement_fee_percent: chargedPercent,
      settlement_fixed_fee: chargedFixed,
      settlement_delivery_income: chargedDeliveryIncome,
      calculated_fee_amount: calculatedTotal,
      settlement_fee_amount: chargedTotal,
      matched:
        chargedTotal === calculatedTotal &&
        chargedPercentFee + chargedFixed + chargedDeliveryIncome === chargedTotal &&
        (policyPercent == null || !Number.isFinite(policyPercent) || policyPercent === chargedPercent),
      settlement_status: String(s.status ?? ""),
      created_at: s.created_at,
      applied_fee_policy_id: snap.policy_id != null ? String(snap.policy_id) : null,
      source: "store_sale_fee_obligations.fee_snapshot",
    };
  });

  const appliedCategory = cnt(summary.applied_category);
  const appliedTopic = cnt(summary.applied_topic);
  const appliedBusiness = appliedCategory + appliedTopic;
  const mismatchCount = verification.filter((v) => !v.matched).length;

  return NextResponse.json({
    ok: true,
    viewer: { can_edit_fee_policy: canEditFeePolicy },
    summary: {
      stores_total: cnt(summary.stores_total),
      applied_default: cnt(summary.applied_default),
      applied_category: appliedCategory,
      applied_topic: appliedTopic,
      applied_business: appliedBusiness,
      applied_store: cnt(summary.applied_store),
      missing_policy: cnt(summary.missing_policy),
      reserved_future: cnt(summary.reserved_future),
      inactive_policies: cnt(summary.inactive_policies),
      verification_mismatch: mismatchCount,
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
          updated_at: platform.updated_at ?? null,
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
    /** R7: 매장 목록은 `?section=stores` 서버 페이지 (전체 건수 = summary.stores_total). */
    stores: [],
    scheduled_changes: scheduled,
    policy_history: policyHistory,
    verification,
    settlements_error: setRes.error?.message ?? null,
    verification_source: "store_sale_fee_obligations.fee_snapshot",
  });
}
