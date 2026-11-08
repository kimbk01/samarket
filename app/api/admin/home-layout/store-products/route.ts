import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { homeStoreMenuHiddenReason } from "@/lib/home/home-store-menu-visibility";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminHomeStoreProductRow = {
  id: string;
  title: string;
  price: number;
  thumbnailUrl: string | null;
  isFeatured: boolean;
  /**
   * 홈에 안 나오는 이유 — 앱 홈과 같은 판정(`homeStoreMenuHiddenReason`).
   * review_or_section = 검수 반려·대기·숨긴 메뉴 구역 · no_photo = 사진 없음 · null = 보임
   */
  hiddenReason: "review_or_section" | "no_photo" | null;
};

/**
 * 어드민 「홈 구성 › 추천 매장·메뉴」 매장별 메뉴 고르기 — GET ?storeId=
 * 판매 중(`product_status=active`) 메뉴만, 대표 → 정렬 순서. 조회 = 관리자 전원.
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const storeId = (new URL(req.url).searchParams.get("storeId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const { data, error } = await sb
    .from("store_products")
    .select("id, title, price, thumbnail_url, is_featured, sort_order, admin_review_status, store_menu_sections ( is_hidden )")
    .eq("store_id", storeId)
    .eq("product_status", "active")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[api/admin/home-layout/store-products]", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const products: AdminHomeStoreProductRow[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    title: String(p.title ?? ""),
    price: Number(p.price ?? 0),
    thumbnailUrl: resolveBrowseFeaturedMenuImageUrl(p.thumbnail_url as string | null),
    isFeatured: p.is_featured === true,
    hiddenReason: homeStoreMenuHiddenReason(p as Parameters<typeof homeStoreMenuHiddenReason>[0]),
  }));
  return NextResponse.json({ ok: true, products });
}
