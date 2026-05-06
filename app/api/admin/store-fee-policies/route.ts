import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const activeOnly = sp.get("active_only") !== "0";
  const includeArchived = sp.get("include_archived") === "1";

  let q = sb
    .from("store_fee_policies")
    .select(
      "id, policy_name, store_id, category_id, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent, is_active, starts_at, ends_at, priority, memo, is_archived, archived_at, archived_by, archive_reason, created_at, updated_at"
    )
    .order("priority", { ascending: true })
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (activeOnly) q = q.eq("is_active", true);
  if (!includeArchived) q = q.eq("is_archived", false);

  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("store_fee_policies") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin store-fee-policies GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, policies: data ?? [] });
}

type PostBody = {
  policy_name?: string;
  store_id?: string | null;
  category_id?: string | null;
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
  return aS <= bE && bS <= aE;
}

async function assertNoActiveConflict(sb: ReturnType<typeof tryGetSupabaseForStores>, opts: {
  excludeId?: string;
  store_id: string | null;
  category_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
}) {
  if (!opts.is_active) return { ok: true as const };
  const scope =
    opts.store_id ? "store" : opts.category_id ? "category" : "default";

  let q = sb!
    .from("store_fee_policies")
    .select("id, priority, starts_at, ends_at, store_id, category_id")
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(500);

  if (opts.excludeId) q = q.neq("id", opts.excludeId);

  if (scope === "store") q = q.eq("store_id", opts.store_id as string);
  else if (scope === "category") q = q.eq("category_id", opts.category_id as string).is("store_id", null);
  else q = q.is("store_id", null).is("category_id", null);

  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message };
  for (const r of data ?? []) {
    const rStart = (r as any).starts_at ? String((r as any).starts_at) : null;
    const rEnd = (r as any).ends_at ? String((r as any).ends_at) : null;
    if (!windowOverlaps(opts.starts_at, opts.ends_at, rStart, rEnd)) continue;
    const rPriority = Math.max(0, Math.round(Number((r as any).priority ?? 0)));
    if (rPriority === opts.priority) {
      return { ok: false as const, error: "conflict_priority_overlap" };
    }
    // 기본 정책은 겹치는 active가 여러 개면 운영 혼란이 크므로 더 강하게 막는다.
    if (scope === "default") {
      return { ok: false as const, error: "conflict_default_overlap" };
    }
  }
  return { ok: true as const };
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

  const storeId = body.store_id ?? null;
  const categoryId = body.category_id ?? null;
  // 타입 규칙:
  // - default: store_id null, category_id null
  // - category: store_id null, category_id set
  // - store: store_id set, category_id optional
  if (!storeId && !categoryId) {
    // ok (default)
  } else if (!storeId && categoryId) {
    // ok (category)
  } else if (storeId) {
    // ok (store)
  } else {
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
    category_id: storeId ? (categoryId ?? null) : categoryId,
    is_active: isActive,
    starts_at: startsAt,
    ends_at: endsAt,
    priority,
  });
  if (!conflict.ok) return NextResponse.json({ ok: false, error: conflict.error }, { status: 409 });

  const payload = {
    policy_name: name,
    store_id: storeId,
    category_id: categoryId,
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

  const { data, error } = await sb.from("store_fee_policies").insert(payload).select("id").maybeSingle();
  if (error) {
    console.error("[admin store-fee-policies POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

