import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER_SELECT =
  "id, store_id, order_id, entry_type, amount, balance_after, description, actor_type, actor_user_id, created_at";

function parseDateBound(raw: string | null, endOfDay: boolean): string | null {
  const s = raw?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`;
}

/** GET /api/admin/store-point-ledger?dateFrom&dateTo&storeId */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const storeId = sp.get("storeId")?.trim() ?? "";
  const dateFrom = parseDateBound(sp.get("dateFrom"), false);
  const dateTo = parseDateBound(sp.get("dateTo"), true);

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ ok: false, error: "date_range_required" }, { status: 400 });
  }

  let query = sb
    .from("store_point_ledger")
    .select(LEDGER_SELECT)
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data, error } = await query;

  if (error) {
    if (/store_point_ledger/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, entries: [], dateFrom, dateTo, storeId: storeId || null });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const storeIds = [...new Set(rows.map((r) => r.store_id as string))];
  const storeById: Record<string, string> = {};

  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = (s.store_name as string) ?? "";
    }
  }

  return NextResponse.json({
    ok: true,
    dateFrom: sp.get("dateFrom")?.trim() ?? "",
    dateTo: sp.get("dateTo")?.trim() ?? "",
    storeId: storeId || null,
    entries: rows.map((r) => ({
      id: r.id,
      storeId: r.store_id,
      storeName: storeById[r.store_id as string] ?? "",
      orderId: r.order_id,
      entryType: r.entry_type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      description: r.description,
      actorType: r.actor_type,
      actorUserId: r.actor_user_id,
      createdAt: r.created_at,
    })),
  });
}
