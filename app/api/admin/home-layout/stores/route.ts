import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminHomeStoreRow = {
  id: string;
  name: string;
  slug: string;
  categorySlug: string | null;
  categoryName: string | null;
  city: string | null;
  profileImageUrl: string | null;
  approved: boolean;
  visible: boolean;
  deliveryAvailable: boolean;
  isOpen: boolean;
  isSample: boolean;
  /** 판매 중 · 손님에게 보이는 메뉴 수 */
  activeMenuCount: number;
};

const SELECT =
  "id, store_name, slug, city, profile_image_url, approval_status, is_visible, delivery_available, is_open, store_kind, store_categories ( slug, name )";

/**
 * 어드민 「홈 구성 › 추천 매장·메뉴」 매장 찾기 — GET ?q=이름(2자 이상, 30건) 또는 ?ids=a,b (고른 매장 상태 다시 보기).
 * 조회 = 관리자 전원 (홈 구성 조회와 같음).
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 30);
  const q = (sp.get("q") ?? "").trim().replace(/[%_,()"\\]/g, "").slice(0, 40);

  let query = sb.from("stores").select(SELECT);
  if (ids.length > 0) query = query.in("id", ids);
  else if (q.length >= 2) query = query.ilike("store_name", `%${q}%`).order("store_name", { ascending: true }).limit(30);
  else return NextResponse.json({ ok: true, stores: [] });

  const { data, error } = await query;
  if (error) {
    console.error("[api/admin/home-layout/stores]", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const storeIds = rows.map((r) => String(r.id));

  const counts = new Map<string, number>();
  if (storeIds.length > 0) {
    const { data: prods } = await sb
      .from("store_products")
      .select("store_id, admin_review_status, store_menu_sections ( is_hidden )")
      .in("store_id", storeIds)
      .eq("product_status", "active")
      .limit(3000);
    for (const p of (prods ?? []) as Record<string, unknown>[]) {
      if (storeProductBuyerVisibilityBlocked(p)) continue;
      const sid = String(p.store_id);
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }

  const one = (v: unknown): { slug?: string; name?: string } | null =>
    Array.isArray(v) ? ((v[0] as { slug?: string; name?: string }) ?? null) : ((v as { slug?: string; name?: string }) ?? null);

  const stores: AdminHomeStoreRow[] = rows.map((r) => {
    const cat = one(r.store_categories);
    return {
      id: String(r.id),
      name: String(r.store_name ?? ""),
      slug: String(r.slug ?? ""),
      categorySlug: cat?.slug ?? null,
      categoryName: cat?.name ?? null,
      city: (r.city as string | null) ?? null,
      profileImageUrl: (r.profile_image_url as string | null) ?? null,
      approved: r.approval_status === "approved",
      visible: r.is_visible === true,
      deliveryAvailable: r.delivery_available === true,
      isOpen: r.is_open === true,
      isSample: r.store_kind === "sample",
      activeMenuCount: counts.get(String(r.id)) ?? 0,
    };
  });
  if (ids.length > 0) stores.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return NextResponse.json({ ok: true, stores });
}
