import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEE_POLICY_LIST_SELECT =
  "id, policy_name, store_id, category_id, topic_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, starts_at, ends_at, priority, memo, is_archived, archived_at, archived_by, archive_reason, created_at, updated_at";

const FEE_POLICY_LIST_SELECT_LEGACY =
  "id, policy_name, store_id, category_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, starts_at, ends_at, priority, memo, is_archived, archived_at, archived_by, archive_reason, created_at, updated_at";

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const activeOnly = sp.get("active_only") !== "0";
  const includeArchived = sp.get("include_archived") === "1";

  const run = async (select: string) => {
    let q = sb
      .from("store_fee_policies")
      .select(select)
      .order("priority", { ascending: true })
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (activeOnly) q = q.eq("is_active", true);
    if (!includeArchived) q = q.eq("is_archived", false);
    return q;
  };

  let { data, error } = await run(FEE_POLICY_LIST_SELECT);
  if (error && /topic_id/i.test(error.message ?? "") && /does not exist|unknown column/i.test(error.message ?? "")) {
    ({ data, error } = await run(FEE_POLICY_LIST_SELECT_LEGACY));
  }
  if (error) {
    if (error.message?.includes("store_fee_policies") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin store-fee-policies GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const policies = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...r,
    topic_id: (r.topic_id as string | null | undefined) ?? null,
  }));

  return NextResponse.json({ ok: true, policies });
}

type PostBody = {
  policy_name?: string;
  store_id?: string | null;
  category_id?: string | null;
  topic_id?: string | null;
  fee_percent?: number;
  fixed_fee?: number;
  delivery_fee_mode?: string;
  delivery_fee_percent?: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number;
  memo?: string | null;
};

function parseIsoOrNull(v: unknown): string | null | "invalid" {
  if (v === null) return null;
  if (v === undefined) return "invalid";
  const s = String(v).trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return "invalid";
  return new Date(t).toISOString();
}

function windowOverlaps(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null) {
  const aS = aStart ? new Date(aStart).getTime() : Number.NEGATIVE_INFINITY;
  const aE = aEnd ? new Date(aEnd).getTime() : Number.POSITIVE_INFINITY;
  const bS = bStart ? new Date(bStart).getTime() : Number.NEGATIVE_INFINITY;
  const bE = bEnd ? new Date(bEnd).getTime() : Number.POSITIVE_INFINITY;
  // Half-open [start, end) — matches resolver ends_at.gt / starts_at.lte.
  return aS < bE && bS < aE;
}

type FeeScope = "store" | "topic" | "category" | "default";

function resolveScope(storeId: string | null, topicId: string | null, categoryId: string | null): FeeScope | "invalid" {
  if (storeId) return "store";
  if (topicId && !storeId) return "topic";
  if (categoryId && !topicId && !storeId) return "category";
  if (!storeId && !topicId && !categoryId) return "default";
  return "invalid";
}

async function assertNoActiveConflict(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  opts: {
    excludeId?: string;
    store_id: string | null;
    category_id: string | null;
    topic_id: string | null;
    is_active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    priority: number;
  }
) {
  if (!opts.is_active) return { ok: true as const };
  const scope = resolveScope(opts.store_id, opts.topic_id, opts.category_id);
  if (scope === "invalid") return { ok: false as const, error: "invalid_scope" };

  let q = sb
    .from("store_fee_policies")
    .select("id, priority, starts_at, ends_at, store_id, category_id, topic_id")
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(500);

  if (opts.excludeId) q = q.neq("id", opts.excludeId);

  if (scope === "store") q = q.eq("store_id", opts.store_id as string);
  else if (scope === "topic") q = q.eq("topic_id", opts.topic_id as string).is("store_id", null);
  else if (scope === "category")
    q = q.eq("category_id", opts.category_id as string).is("store_id", null).is("topic_id", null);
  else q = q.is("store_id", null).is("category_id", null).is("topic_id", null);

  const { data, error } = await q;
  if (error) {
    if (/topic_id/i.test(error.message ?? "") && /does not exist|unknown column/i.test(error.message ?? "")) {
      // Pre-migration: topic scope cannot conflict-check; reject topic writes.
      if (scope === "topic") return { ok: false as const, error: "topic_column_missing" };
      let q2 = sb
        .from("store_fee_policies")
        .select("id, priority, starts_at, ends_at, store_id, category_id")
        .eq("is_active", true)
        .eq("is_archived", false)
        .limit(500);
      if (opts.excludeId) q2 = q2.neq("id", opts.excludeId);
      if (scope === "store") q2 = q2.eq("store_id", opts.store_id as string);
      else if (scope === "category") q2 = q2.eq("category_id", opts.category_id as string).is("store_id", null);
      else q2 = q2.is("store_id", null).is("category_id", null);
      const retry = await q2;
      if (retry.error) return { ok: false as const, error: retry.error.message };
      for (const r of retry.data ?? []) {
        const rStart = (r as { starts_at?: string | null }).starts_at
          ? String((r as { starts_at?: string | null }).starts_at)
          : null;
        const rEnd = (r as { ends_at?: string | null }).ends_at
          ? String((r as { ends_at?: string | null }).ends_at)
          : null;
        if (!windowOverlaps(opts.starts_at, opts.ends_at, rStart, rEnd)) continue;
        const rPriority = Math.max(0, Math.round(Number((r as { priority?: number }).priority ?? 0)));
        if (rPriority === opts.priority) return { ok: false as const, error: "conflict_priority_overlap" };
        if (scope === "default") return { ok: false as const, error: "conflict_default_overlap" };
      }
      return { ok: true as const };
    }
    return { ok: false as const, error: error.message };
  }
  for (const r of data ?? []) {
    const rStart = (r as { starts_at?: string | null }).starts_at
      ? String((r as { starts_at?: string | null }).starts_at)
      : null;
    const rEnd = (r as { ends_at?: string | null }).ends_at
      ? String((r as { ends_at?: string | null }).ends_at)
      : null;
    if (!windowOverlaps(opts.starts_at, opts.ends_at, rStart, rEnd)) continue;
    const rPriority = Math.max(0, Math.round(Number((r as { priority?: number }).priority ?? 0)));
    if (rPriority === opts.priority) {
      return { ok: false as const, error: "conflict_priority_overlap" };
    }
    if (scope === "default") {
      return { ok: false as const, error: "conflict_default_overlap" };
    }
  }
  return { ok: true as const };
}

async function resolveTopicParentCategory(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  topicId: string
): Promise<{ ok: true; categoryId: string } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("store_topics")
    .select("id, store_category_id")
    .eq("id", topicId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "topic_not_found" };
  const cat = typeof data.store_category_id === "string" ? data.store_category_id.trim() : "";
  if (!cat) return { ok: false, error: "topic_missing_category" };
  return { ok: true, categoryId: cat };
}

export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.policy_name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ ok: false, error: "policy_name_required" }, { status: 400 });

  const feePercent = Number(body.fee_percent ?? 0);
  const fixedFee = Math.max(0, Math.round(Number(body.fixed_fee ?? 0)));
  const deliveryMode = String(body.delivery_fee_mode ?? "none").trim();
  const deliveryPercent = Number(body.delivery_fee_percent ?? 0);
  const priority = Math.max(0, Math.round(Number(body.priority ?? 100)));

  let storeId = body.store_id ?? null;
  let categoryId = body.category_id ?? null;
  let topicId = body.topic_id ?? null;
  if (typeof storeId === "string") storeId = storeId.trim() || null;
  if (typeof categoryId === "string") categoryId = categoryId.trim() || null;
  if (typeof topicId === "string") topicId = topicId.trim() || null;

  // Scope:
  // - default: all null
  // - category (1차): category_id, topic null, store null
  // - topic (2차): topic_id, store null (category filled from topic parent)
  // - store: store_id set
  if (topicId && !storeId) {
    const parent = await resolveTopicParentCategory(sb, topicId);
    if (!parent.ok) return NextResponse.json({ ok: false, error: parent.error }, { status: 400 });
    categoryId = parent.categoryId;
  }

  const scope = resolveScope(storeId, topicId, categoryId);
  if (scope === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  const startsAt = body.starts_at === undefined ? null : parseIsoOrNull(body.starts_at);
  const endsAt = body.ends_at === undefined ? null : parseIsoOrNull(body.ends_at);
  if (startsAt === "invalid" || endsAt === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_window" }, { status: 400 });
  }
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    return NextResponse.json({ ok: false, error: "invalid_window" }, { status: 400 });
  }

  const isActive = body.is_active !== false;
  const conflict = await assertNoActiveConflict(sb, {
    store_id: storeId,
    category_id: categoryId,
    topic_id: topicId,
    is_active: isActive,
    starts_at: startsAt,
    ends_at: endsAt,
    priority,
  });
  if (!conflict.ok) return NextResponse.json({ ok: false, error: conflict.error }, { status: 409 });

  const payload: Record<string, unknown> = {
    policy_name: name,
    store_id: storeId,
    category_id: categoryId,
    topic_id: topicId,
    fee_percent: Number.isFinite(feePercent) ? feePercent : 0,
    fixed_fee: fixedFee,
    delivery_fee_mode: deliveryMode,
    delivery_fee_percent: Number.isFinite(deliveryPercent) ? deliveryPercent : 0,
    is_active: isActive,
    starts_at: startsAt,
    ends_at: endsAt,
    priority,
    memo: typeof body.memo === "string" ? body.memo.trim().slice(0, 1000) : body.memo === null ? null : null,
  };

  let { data, error } = await sb.from("store_fee_policies").insert(payload).select("id").maybeSingle();
  if (error && /topic_id/i.test(error.message ?? "") && /does not exist|unknown column/i.test(error.message ?? "")) {
    if (topicId) {
      return NextResponse.json({ ok: false, error: "topic_column_missing" }, { status: 503 });
    }
    delete payload.topic_id;
    ({ data, error } = await sb.from("store_fee_policies").insert(payload).select("id").maybeSingle());
  }
  if (error) {
    console.error("[admin store-fee-policies POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}
