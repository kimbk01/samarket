import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import {
  loadStoreProductRowForWrite,
  updateStoreProduct,
  type UpdateStoreProductBody,
} from "@/lib/stores/catalog/update-store-product";
import { ADMIN_SAMPLE_CATALOG_WRITE_POLICY } from "@/lib/stores/catalog/store-catalog-write-policy";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { afterAdminSampleWrite, requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — 샘플 매장 상품 수정·숨김·품절·삭제(product_status) — 오너 수정과 같은 카탈로그 코어 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; productId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id, productId } = await context.params;
  const sid = String(id ?? "").trim();
  const pid = String(productId ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;
  const uiLang = await loadUserAppLanguage(sb, gate.actor.userId, req.headers.get("accept-language"));

  const loaded = await loadStoreProductRowForWrite(sb, sid, pid);
  if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  let body: UpdateStoreProductBody;
  try {
    body = (await req.json()) as UpdateStoreProductBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const productRow = loaded.product as Record<string, unknown>;
  const result = await updateStoreProduct(sb, sid, pid, productRow, loaded.lockColumnsAvailable, body, {
    uiLang,
    policy: ADMIN_SAMPLE_CATALOG_WRITE_POLICY,
    reloadProduct: async () => (await loadStoreProductRowForWrite(sb, sid, pid))?.product ?? null,
    imageCleanupContext: "admin/sample/product/replace-image",
  });
  if (result.status !== 200) return NextResponse.json(result.json, { status: result.status });
  invalidateOwnerProductsListCache(sid);
  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: sid,
    slug: sample.store.slug,
    action: "product_update",
    before: { product_id: pid, title: productRow.title ?? null, product_status: productRow.product_status ?? null },
    after: { product_id: pid, fields: Object.keys(body) },
  });
  return NextResponse.json(result.json);
}
