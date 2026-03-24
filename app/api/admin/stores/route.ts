import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 매장 목록 + 판매권한 요약 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();

  let q = sb
    .from("stores")
    .select(
      [
        "id, store_name, slug, owner_user_id, approval_status, is_visible, business_type",
        "store_category_id, store_topic_id, owner_can_edit_store_identity",
        "description, kakao_id, phone, email, website_url, region, city, district",
        "address_line1, address_line2, lat, lng, profile_image_url",
        "created_at, approved_at, rejected_reason, revision_note, suspended_reason",
        "store_categories ( name ), store_topics ( name )",
      ].join(", ")
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (status && status !== "all") {
    q = q.eq("approval_status", status);
  }

  const { data: stores, error } = await q;
  if (error) {
    console.error("[admin/stores GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type AdminStoreListRow = { id: string } & Record<string, unknown>;
  const list: AdminStoreListRow[] = Array.isArray(stores)
    ? (stores as unknown as AdminStoreListRow[])
    : [];
  const ids = list.map((s) => s.id);
  const permByStore: Record<string, Record<string, unknown>> = {};
  if (ids.length > 0) {
    const { data: perms } = await sb
      .from("store_sales_permissions")
      .select("store_id, allowed_to_sell, sales_status, approved_at, rejection_reason, suspension_reason")
      .in("store_id", ids);
    for (const p of perms ?? []) {
      const sid = p.store_id as string;
      permByStore[sid] = p as Record<string, unknown>;
    }
  }

  return NextResponse.json({
    ok: true,
    stores: list.map((s) => ({
      ...s,
      sales_permission: permByStore[s.id] ?? null,
    })),
  });
}
