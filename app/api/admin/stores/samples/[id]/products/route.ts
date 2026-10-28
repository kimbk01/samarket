import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import { createStoreProduct, type CreateStoreProductBody } from "@/lib/stores/catalog/create-store-product";
import { ADMIN_SAMPLE_CATALOG_WRITE_POLICY } from "@/lib/stores/catalog/store-catalog-write-policy";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { afterAdminSampleWrite, requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 샘플 매장 메뉴 구역·상품 (삭제 제외) */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id } = await context.params;
  const sid = String(id ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;
  const [sections, products] = await Promise.all([
    sb.from("store_menu_sections").select("id, name, sort_order, description, is_hidden").eq("store_id", sid).order("sort_order"),
    sb
      .from("store_products")
      .select(
        "id, title, summary, price, discount_price, discount_percent, product_status, item_type, menu_section_id, sort_order, thumbnail_url, images_json, options_json, is_owner_recommended, is_representative, updated_at"
      )
      .eq("store_id", sid)
      .neq("product_status", "deleted")
      .order("sort_order"),
  ]);
  if (sections.error || products.error) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true, store: sample.store, sections: sections.data ?? [], products: products.data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** POST — 샘플 매장 상품 등록 (오너 등록과 같은 카탈로그 코어 · 관리자 샘플 정책) */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id } = await context.params;
  const sid = String(id ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;
  const uiLang = await loadUserAppLanguage(sb, gate.actor.userId, req.headers.get("accept-language"));

  let body: CreateStoreProductBody;
  try {
    body = (await req.json()) as CreateStoreProductBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await createStoreProduct(sb, sid, body, { uiLang, policy: ADMIN_SAMPLE_CATALOG_WRITE_POLICY });
  if (result.status !== 200 || result.noWrite) {
    return NextResponse.json(result.json, result.status === 200 ? undefined : { status: result.status });
  }
  invalidateOwnerProductsListCache(sid);
  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: sid,
    slug: sample.store.slug,
    action: "product_create",
    after: { product: (result.json as { product?: unknown }).product ?? null, title: body.title ?? null },
  });
  return NextResponse.json(result.json);
}
