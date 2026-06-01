import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = {
  delta?: number;
  memo?: string;
};

/** POST /api/admin/store-points/[storeId]/adjust */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const delta = Math.trunc(Number(body.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ ok: false, error: "delta_zero" }, { status: 400 });
  }

  const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 500) : "";

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb.rpc("adjust_store_point_balance", {
    p_store_id: sid,
    p_delta: delta,
    p_admin_user_id: admin.userId,
    p_memo: memo,
  });

  if (error) {
    if (/adjust_store_point_balance/i.test(error.message)) {
      return NextResponse.json(
        { ok: false, error: "rpc_missing", hint: "Apply migration 20260830160000_store_point_admin_adjust" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === false) {
    return NextResponse.json(
      { ok: false, error: String(result.error ?? "adjust_failed") },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, result });
}
