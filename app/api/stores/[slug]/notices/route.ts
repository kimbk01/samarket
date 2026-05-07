import { NextResponse } from "next/server";
import { getApprovedStoreBySlug, STORE_SELECT_ID_SLUG_GATE } from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isScheduleRowActive, type StoreNoticePublicRow } from "@/lib/stores/store-banners-notices-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, notices: [] as StoreNoticePublicRow[], meta: { source: "supabase_unconfigured" } });
  }

  const gate = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_ID_SLUG_GATE);
  if (!gate.ok) {
    return NextResponse.json({ ok: true, notices: [] as StoreNoticePublicRow[] });
  }

  const storeId = String(gate.store.id);

  const { data, error } = await sb
    .from("store_notices")
    .select("id, title, body, images_json, placement, sort_order, is_active, start_at, end_at")
    .eq("store_id", storeId)
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(String(error.message))) {
      return NextResponse.json({ ok: true, notices: [], meta: { source: "migration_pending" } });
    }
    console.error("[GET store notices]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as StoreNoticePublicRow[];
  const notices = rows.filter((r) => isScheduleRowActive(r));

  return NextResponse.json({ ok: true, notices, meta: { store_id: storeId } });
}
