import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
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
  is_archived?: boolean;
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
    excludeId: string;
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
    .neq("id", opts.excludeId)
    .limit(500);

  if (scope === "store") q = q.eq("store_id", opts.store_id as string);
  else if (scope === "topic") q = q.eq("topic_id", opts.topic_id as string).is("store_id", null);
  else if (scope === "category")
    q = q.eq("category_id", opts.category_id as string).is("store_id", null).is("topic_id", null);
  else q = q.is("store_id", null).is("category_id", null).is("topic_id", null);

  const { data, error } = await q;
  if (error) {
    if (/topic_id/i.test(error.message ?? "") && /does not exist|unknown column/i.test(error.message ?? "")) {
      if (scope === "topic") return { ok: false as const, error: "topic_column_missing" };
      let q2 = sb
        .from("store_fee_policies")
        .select("id, priority, starts_at, ends_at, store_id, category_id")
        .eq("is_active", true)
        .eq("is_archived", false)
        .neq("id", opts.excludeId)
        .limit(500);
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
    if (rPriority === opts.priority) return { ok: false as const, error: "conflict_priority_overlap" };
    if (scope === "default") return { ok: false as const, error: "conflict_default_overlap" };
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

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const pid = typeof id === "string" ? id.trim() : "";
  if (!pid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("policy_name" in body) {
    const name = String(body.policy_name ?? "").trim().slice(0, 80);
    if (!name) return NextResponse.json({ ok: false, error: "policy_name_required" }, { status: 400 });
    patch.policy_name = name;
  }
  if ("store_id" in body) {
    const v = body.store_id;
    patch.store_id = typeof v === "string" ? v.trim() || null : v ?? null;
  }
  if ("category_id" in body) {
    const v = body.category_id;
    patch.category_id = typeof v === "string" ? v.trim() || null : v ?? null;
  }
  if ("topic_id" in body) {
    const v = body.topic_id;
    patch.topic_id = typeof v === "string" ? v.trim() || null : v ?? null;
  }
  if ("fee_percent" in body) patch.fee_percent = Number(body.fee_percent ?? 0) || 0;
  if ("fixed_fee" in body) patch.fixed_fee = Math.max(0, Math.round(Number(body.fixed_fee ?? 0)));
  if ("delivery_fee_mode" in body) patch.delivery_fee_mode = String(body.delivery_fee_mode ?? "none").trim();
  if ("delivery_fee_percent" in body) patch.delivery_fee_percent = Number(body.delivery_fee_percent ?? 0) || 0;
  if ("is_active" in body) patch.is_active = body.is_active === true;
  if ("starts_at" in body) {
    const v = parseIsoOrNull(body.starts_at);
    if (v === "invalid") return NextResponse.json({ ok: false, error: "invalid_window" }, { status: 400 });
    patch.starts_at = v;
  }
  if ("ends_at" in body) {
    const v = parseIsoOrNull(body.ends_at);
    if (v === "invalid") return NextResponse.json({ ok: false, error: "invalid_window" }, { status: 400 });
    patch.ends_at = v;
  }
  if ("priority" in body) patch.priority = Math.max(0, Math.round(Number(body.priority ?? 100)));
  if ("memo" in body) {
    if (body.memo === null) patch.memo = null;
    else if (typeof body.memo === "string") patch.memo = body.memo.trim().slice(0, 1000);
    else patch.memo = null;
  }

  const wantsUnarchive = "is_archived" in body && body.is_archived === false;
  if (Object.keys(patch).length === 0 && !wantsUnarchive) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  type FeePolicyCurrent = {
    id: string;
    store_id: string | null;
    category_id: string | null;
    topic_id: string | null;
    is_active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    priority: number;
    is_archived?: boolean;
  };

  let current: FeePolicyCurrent | null = null;

  {
    const { data, error: curErr } = await sb
      .from("store_fee_policies")
      .select("id, store_id, category_id, topic_id, is_active, starts_at, ends_at, priority, is_archived")
      .eq("id", pid)
      .maybeSingle();
    if (curErr) {
      if (/topic_id/i.test(curErr.message ?? "") && /does not exist|unknown column/i.test(curErr.message ?? "")) {
        const retry = await sb
          .from("store_fee_policies")
          .select("id, store_id, category_id, is_active, starts_at, ends_at, priority, is_archived")
          .eq("id", pid)
          .maybeSingle();
        if (retry.error) return NextResponse.json({ ok: false, error: retry.error.message }, { status: 500 });
        if (!retry.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        const legacy = retry.data as unknown as Omit<FeePolicyCurrent, "topic_id">;
        current = { ...legacy, topic_id: null };
      } else {
        return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
      }
    } else {
      current = data as FeePolicyCurrent | null;
    }
  }
  if (!current) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const wasArchived = Boolean(current.is_archived);

  if (wasArchived && !wantsUnarchive && Object.keys(patch).length > 0) {
    return NextResponse.json({ ok: false, error: "policy_archived" }, { status: 409 });
  }

  if (wantsUnarchive) {
    if (!wasArchived) {
      return NextResponse.json({ ok: false, error: "not_archived" }, { status: 400 });
    }
    patch.is_archived = false;
    patch.archived_at = null;
    patch.archived_by = null;
    patch.archive_reason = null;
  }

  const nextStoreId =
    "store_id" in patch
      ? (patch.store_id as string | null)
      : ((current as { store_id?: string | null }).store_id as string | null);
  const nextTopicId =
    "topic_id" in patch
      ? (patch.topic_id as string | null)
      : (((current as { topic_id?: string | null }).topic_id as string | null) ?? null);
  let nextCategoryId =
    "category_id" in patch
      ? (patch.category_id as string | null)
      : ((current as { category_id?: string | null }).category_id as string | null);

  if (nextTopicId && !nextStoreId) {
    const parent = await resolveTopicParentCategory(sb, nextTopicId);
    if (!parent.ok) return NextResponse.json({ ok: false, error: parent.error }, { status: 400 });
    nextCategoryId = parent.categoryId;
    patch.category_id = parent.categoryId;
    patch.topic_id = nextTopicId;
  }
  if (!nextTopicId && "topic_id" in patch) {
    patch.topic_id = null;
  }

  const nextIsActive =
    "is_active" in patch ? Boolean(patch.is_active) : Boolean((current as { is_active?: boolean }).is_active);
  const nextStartsAt =
    "starts_at" in patch
      ? ((patch.starts_at as string | null) ?? null)
      : ((current as { starts_at?: string | null }).starts_at as string | null);
  const nextEndsAt =
    "ends_at" in patch
      ? ((patch.ends_at as string | null) ?? null)
      : ((current as { ends_at?: string | null }).ends_at as string | null);
  const nextPriority =
    "priority" in patch
      ? Math.max(0, Math.round(Number(patch.priority ?? 0)))
      : Math.max(0, Math.round(Number((current as { priority?: number }).priority ?? 0)));

  const scope = resolveScope(nextStoreId, nextTopicId, nextCategoryId);
  if (scope === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }
  if (nextStartsAt && nextEndsAt && new Date(nextStartsAt).getTime() > new Date(nextEndsAt).getTime()) {
    return NextResponse.json({ ok: false, error: "invalid_window" }, { status: 400 });
  }

  const conflict = await assertNoActiveConflict(sb, {
    excludeId: pid,
    store_id: nextStoreId,
    category_id: nextCategoryId,
    topic_id: nextTopicId,
    is_active: nextIsActive,
    starts_at: nextStartsAt,
    ends_at: nextEndsAt,
    priority: nextPriority,
  });
  if (!conflict.ok) return NextResponse.json({ ok: false, error: conflict.error }, { status: 409 });

  let { data, error } = await sb.from("store_fee_policies").update(patch).eq("id", pid).select("id").maybeSingle();
  if (error && /topic_id/i.test(error.message ?? "") && /does not exist|unknown column/i.test(error.message ?? "")) {
    if ("topic_id" in patch && patch.topic_id) {
      return NextResponse.json({ ok: false, error: "topic_column_missing" }, { status: 503 });
    }
    const legacyPatch = { ...patch };
    delete legacyPatch.topic_id;
    ({ data, error } = await sb.from("store_fee_policies").update(legacyPatch).eq("id", pid).select("id").maybeSingle());
  }

  if (error) {
    console.error("[admin store-fee-policies PATCH]", wantsUnarchive ? "restore" : "update", error);
    return NextResponse.json(
      { ok: false, error: wantsUnarchive ? "failed_to_restore" : error.message },
      { status: 500 }
    );
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

type DeleteBody = {
  archive_reason?: string | null;
};

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const pid = typeof id === "string" ? id.trim() : "";
  if (!pid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let archiveReason: string | null = null;
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      const b = (await req.json()) as DeleteBody;
      if (typeof b.archive_reason === "string") archiveReason = b.archive_reason.trim().slice(0, 2000);
      else if (b.archive_reason === null) archiveReason = null;
    } catch {
      // ignore invalid JSON bodies on DELETE
    }
  }

  const actorId = await getRouteUserId();
  const now = new Date().toISOString();

  const { data: pre } = await sb.from("store_fee_policies").select("id, is_archived").eq("id", pid).maybeSingle();
  if (!pre) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (Boolean((pre as { is_archived?: boolean }).is_archived)) {
    return NextResponse.json({ ok: true });
  }

  const { data: updated, error } = await sb
    .from("store_fee_policies")
    .update({
      is_archived: true,
      archived_at: now,
      archived_by: actorId,
      archive_reason: archiveReason,
    })
    .eq("id", pid)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin store-fee-policies DELETE archive]", error);
    return NextResponse.json({ ok: false, error: "failed_to_archive" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
