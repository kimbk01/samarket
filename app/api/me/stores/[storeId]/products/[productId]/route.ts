import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  loadStoreProductRowForWrite,
  updateStoreProduct,
  type UpdateStoreProductBody,
} from "@/lib/stores/catalog/update-store-product";
import { OWNER_CATALOG_WRITE_POLICY } from "@/lib/stores/catalog/store-catalog-write-policy";
import { getStoreIfOwner, type StoreGateRow } from "@/lib/stores/owner-product-gate";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProductForOwner(
  sb: ReturnType<typeof tryGetSupabaseForStores>,
  userId: string,
  storeId: string,
  productId: string,
  /** PATCH — `guardOwnerCatalogWrite` 가 이미 소유를 확인한 매장 행 (중복 조회 생략) */
  verifiedStore?: StoreGateRow
) {
  if (!sb) return { error: "no_sb" as const };
  const gate = verifiedStore
    ? ({ ok: true as const, store: verifiedStore })
    : await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) return { error: "gate", gate };

  const loaded = await loadStoreProductRowForWrite(sb, storeId, productId);
  if (!loaded) {
    return { error: "not_found" as const };
  }
  return { product: loaded.product, store: gate.store, lockColumnsAvailable: loaded.lockColumnsAvailable };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const res = await loadProductForOwner(sb, userId, sid, pid);
  if (res.error === "no_sb") {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (res.error === "gate" && res.gate) {
    return NextResponse.json({ ok: false, error: res.gate.error }, { status: res.gate.status });
  }
  if (res.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: res.product });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트 (POST 와 같은 가드). 정지 매장은 403 store_suspended.
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;
  const uiLang = await loadUserAppLanguage(sb, userId, req.headers.get("accept-language"));

  const loaded = await loadProductForOwner(sb, userId, sid, pid, guard.store);
  if (loaded.error === "no_sb") {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (loaded.error === "gate" && loaded.gate) {
    return NextResponse.json({ ok: false, error: loaded.gate.error }, { status: loaded.gate.status });
  }
  if (loaded.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!("store" in loaded) || !loaded.store) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!("product" in loaded) || !loaded.product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const productRow = loaded.product as unknown as Record<string, unknown>;
  const lockColumnsAvailable = loaded.lockColumnsAvailable !== false;

  let body: UpdateStoreProductBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // S-5 — 검증·저장은 카탈로그 코어(오너·관리자 샘플 공용), 게이트·캐시 세대는 이 라우트
  const result = await updateStoreProduct(sb, sid, pid, productRow, lockColumnsAvailable, body, {
    uiLang,
    policy: OWNER_CATALOG_WRITE_POLICY,
    reloadProduct: async () => {
      const latest = await loadProductForOwner(sb, userId, sid, pid);
      return "product" in latest ? latest.product : null;
    },
    imageCleanupContext: "owner/product/replace-image",
  });
  if (result.status !== 200) {
    return NextResponse.json(result.json, { status: result.status });
  }

  invalidateOwnerProductsListCache(sid);
  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  // OPS-02 — 인스턴스 공통 공개 캐시 세대 (관리자 쓰기와 같은 DEF-64 계약)
  bumpStorePublicSharedCacheGeneration("owner_store.product_update");

  return NextResponse.json(result.json);
}
