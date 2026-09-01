import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** GET /api/admin/store-points — 이전 매장 운영 원장 보관 조회 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get("limit")) || DEFAULT_LIMIT));

  let query = sb
    .from("stores")
    .select("id, store_name, point_balance, point_commerce_blocked, point_block_reason", {
      count: "exact",
    })
    .order("store_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.ilike("store_name", `%${q.replace(/%/g, "\\%")}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    if (/point_balance/i.test(error.message) && /does not exist/i.test(error.message)) {
      const { data: fallback, error: fbErr, count: fbCount } = await sb
        .from("stores")
        .select("id, store_name", { count: "exact" })
        .order("store_name", { ascending: true })
        .range(offset, offset + limit - 1);
      if (fbErr) {
        return NextResponse.json({ ok: false, error: fbErr.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        stores: (fallback ?? []).map((s) => ({
          id: s.id,
          store_name: s.store_name,
          point_balance: 0,
          point_commerce_blocked: false,
          point_block_reason: null,
        })),
        total: fbCount ?? 0,
        offset,
        limit,
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stores: (data ?? []).map((s) => ({
      id: s.id,
      store_name: s.store_name,
      point_balance: Number(s.point_balance) || 0,
      point_commerce_blocked: Boolean(s.point_commerce_blocked),
      point_block_reason: s.point_block_reason ?? null,
    })),
    total: count ?? 0,
    offset,
    limit,
  });
}
