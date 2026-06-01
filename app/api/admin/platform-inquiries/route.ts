import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INQUIRY_TYPES = new Set(["general", "store_ops", "store_point", "settlement", "ad"]);

/** GET /api/admin/platform-inquiries */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const type = req.nextUrl.searchParams.get("inquiry_type")?.trim() ?? "";
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";

  let q = sb
    .from("platform_admin_inquiries")
    .select(
      "id, inquiry_type, inquiry_kind, store_id, from_user_id, subject, content, attachment_urls, status, answer, answered_by, answered_at, related_charge_request_id, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (type && INQUIRY_TYPES.has(type)) q = q.eq("inquiry_type", type);
  if (status) q = q.eq("status", status);

  const { data: rows, error } = await q;
  if (error) {
    if (/platform_admin_inquiries/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ ok: true, inquiries: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id).filter(Boolean))] as string[];
  const storeById: Record<string, { name: string; pointBalance: number }> = {};
  if (storeIds.length) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name, point_balance")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = {
        name: (s.store_name as string) ?? "",
        pointBalance: Number(s.point_balance) || 0,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    inquiries: list.map((r) => {
      const storeMeta = r.store_id ? storeById[r.store_id as string] : undefined;
      return {
        ...r,
        store_name: storeMeta?.name ?? "",
        point_balance: storeMeta?.pointBalance ?? 0,
      };
    }),
  });
}
