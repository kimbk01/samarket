import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  auditAdminFeePolicyWrite,
  supersedeFeePolicyAtomic,
} from "@/lib/stores/commission/admin-fee-policy-guards";
import {
  DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR,
  isDeliveryFeeModeAllowed,
} from "@/lib/stores/commission/store-commission-contract";
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
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
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
  /** 예약 변경: 기존 정책을 새 정책 시작 시각에 종료하고 새 정책을 같은 트랜잭션에서 생성 (DEF-3 · D-1 RPC). */
  supersede_policy_id?: string | null;
  /** 예약 변경 대상 정책의 화면 로드 시점 updated_at (CAS). */
  supersede_expected_updated_at?: string | null;
  change_reason?: string | null;
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
      if (retry.error) {
        console.error("[admin store-fee-policies] conflict check", retry.error.message);
        return { ok: false as const, error: "query_failed" };
      }
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
    console.error("[admin store-fee-policies] conflict check", error.message);
    return { ok: false as const, error: "query_failed" };
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
  if (error) {
    console.error("[admin store-fee-policies] topic parent", error.message);
    return { ok: false, error: "query_failed" };
  }
  if (!data) return { ok: false, error: "topic_not_found" };
  const cat = typeof data.store_category_id === "string" ? data.store_category_id.trim() : "";
  if (!cat) return { ok: false, error: "topic_missing_category" };
  return { ok: true, categoryId: cat };
}

/**
 * D-1 RPC 가 아직 없는 DB 용 보상 경로 (기존 동작): 기존 정책 종료(버전 조건) → 새 정책 생성, 생성 실패 시 종료 시각 복원.
 */
async function supersedeFeePolicyCompensating(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  input: {
    supersedeId: string;
    newPolicy: Record<string, unknown>;
    expectedUpdatedAt: string | null;
    startsAt: string;
    prevEndsAt: string | null;
  }
): Promise<
  { ok: true; id: string; supersededPrevEndsAt: string | null } | { ok: false; error: string; status: number }
> {
  let endQ = sb
    .from("store_fee_policies")
    .update({ ends_at: input.startsAt })
    .eq("id", input.supersedeId)
    .eq("is_archived", false);
  if (input.expectedUpdatedAt) endQ = endQ.eq("updated_at", input.expectedUpdatedAt);
  const { data: ended, error: endErr } = await endQ.select("id");
  if (endErr) {
    console.error("[admin store-fee-policies POST supersede end]", endErr);
    return { ok: false, error: "supersede_failed", status: 500 };
  }
  if (!ended || ended.length === 0) return { ok: false, error: "stale_policy", status: 409 };
  const { data, error } = await sb.from("store_fee_policies").insert(input.newPolicy).select("id").maybeSingle();
  if (error || !data?.id) {
    console.error("[admin store-fee-policies POST supersede create]", error);
    const { error: revErr } = await sb
      .from("store_fee_policies")
      .update({ ends_at: input.prevEndsAt })
      .eq("id", input.supersedeId);
    if (revErr) console.error("[admin store-fee-policies POST supersede revert]", revErr);
    return { ok: false, error: "create_failed", status: 500 };
  }
  return { ok: true, id: String(data.id), supersededPrevEndsAt: input.prevEndsAt };
}

/** B-2: 수수료 정책 변경 = super_admin 전용. */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
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
  // D-3: delivery fee is already in the commission base — percent mode would charge it twice.
  if (!isDeliveryFeeModeAllowed(deliveryMode)) {
    return NextResponse.json({ ok: false, error: DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR }, { status: 400 });
  }
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
    if (!parent.ok)
      return NextResponse.json(
        { ok: false, error: parent.error },
        { status: parent.error === "query_failed" ? 500 : 400 }
      );
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
  const changeReason =
    typeof body.change_reason === "string" ? body.change_reason.trim().slice(0, 1000) || null : null;

  // 예약 변경 (D-1): 기존 정책 종료 + 새 정책 생성은 DB RPC 한 트랜잭션. 비원자 폴백 없음.
  const supersedeId =
    typeof body.supersede_policy_id === "string" ? body.supersede_policy_id.trim() : "";
  if (supersedeId && !startsAt) {
    return NextResponse.json({ ok: false, error: "supersede_requires_starts_at" }, { status: 400 });
  }
  let supersedePrev: Record<string, unknown> | null = null;
  if (supersedeId) {
    const { data: prev, error: prevErr } = await sb
      .from("store_fee_policies")
      .select("id, policy_name, fee_percent, fixed_fee, starts_at, ends_at, is_active, is_archived, updated_at")
      .eq("id", supersedeId)
      .maybeSingle();
    if (prevErr || !prev) {
      return NextResponse.json({ ok: false, error: "supersede_policy_not_found" }, { status: 404 });
    }
    if ((prev as { is_archived?: boolean }).is_archived) {
      return NextResponse.json({ ok: false, error: "policy_archived" }, { status: 409 });
    }
    supersedePrev = prev as Record<string, unknown>;
  }

  const conflict = await assertNoActiveConflict(sb, {
    // 예약 변경 대상은 새 시작 시각에 끝나므로(반열린 구간) 겹침 검사에서 제외한다.
    excludeId: supersedeId || undefined,
    store_id: storeId,
    category_id: categoryId,
    topic_id: topicId,
    is_active: isActive,
    starts_at: startsAt,
    ends_at: endsAt,
    priority,
  });
  if (!conflict.ok) {
    return NextResponse.json(
      { ok: false, error: conflict.error },
      { status: conflict.error === "query_failed" ? 500 : 409 }
    );
  }

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

  if (supersedeId) {
    const expectedUpdatedAt =
      typeof body.supersede_expected_updated_at === "string" && body.supersede_expected_updated_at.trim()
        ? body.supersede_expected_updated_at.trim()
        : null;
    let res = await supersedeFeePolicyAtomic(sb, {
      supersedeId,
      newPolicy: payload,
      expectedUpdatedAt,
    });
    if (!res.ok && res.error === "rpc_missing") {
      // D-1 RPC 마이그레이션 적용 전 — 기존 보상 방식(종료 → 생성, 실패 시 종료 시각 복원)을 유지한다.
      res = await supersedeFeePolicyCompensating(sb, {
        supersedeId,
        newPolicy: payload,
        expectedUpdatedAt,
        startsAt: startsAt as string,
        prevEndsAt: ((supersedePrev?.ends_at as string | null | undefined) ?? null),
      });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }
    await auditAdminFeePolicyWrite(sb, req, {
      actorId: gate.actor.userId,
      action: "store_fee_policy.supersede",
      policyId: res.id,
      before: { superseded_policy: supersedePrev, superseded_ends_at: res.supersededPrevEndsAt },
      after: { ...payload, superseded_policy_id: supersedeId, superseded_policy_new_ends_at: startsAt },
      reason: changeReason,
    });
    return NextResponse.json({ ok: true, id: res.id });
  }

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
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 500 });
  }

  await auditAdminFeePolicyWrite(sb, req, {
    actorId: gate.actor.userId,
    action: "store_fee_policy.create",
    policyId: (data?.id as string | undefined) ?? null,
    before: null,
    after: payload,
    reason: changeReason,
  });

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}
