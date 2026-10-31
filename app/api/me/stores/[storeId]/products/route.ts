import { NextRequest, NextResponse } from "next/server";
import { readActiveSessionFingerprintForUser } from "@/lib/auth/active-session";
import { peekAuthSessionValidateCached } from "@/lib/auth/auth-session-validate-cache";
import { validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { createStoreProductCore } from "@/lib/stores/owner-catalog/products-core.server";
import { ownerCatalogActor } from "@/lib/stores/owner-catalog/store-catalog-actor";
import {
  guardOwnerCatalogWrite,
  ownerCatalogDbErrorResponse,
} from "@/lib/stores/owner-catalog-write-guard";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import {
  loadOwnerProductsListSnapshot,
  parseOwnerProductsListLimit,
  peekOwnerProductsListCacheHit,
} from "@/lib/stores/owner-products-list-snapshot";
import {
  syncStorePublicReadCachesWithSharedGeneration,
} from "@/lib/stores/store-public-shared-cache-generation";
import {
  jsonPayloadKb,
  logOwnerProductsPerf,
  perfNowMs,
} from "@/lib/stores/owner-products-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  /** PRD-09 — 관리자 상품 조치·오너 쓰기의 인스턴스 공통 세대 확인 (창 내 메모리 비교만, 무DB) */
  const sharedGenerationSync = syncStorePublicReadCachesWithSharedGeneration();
  const tAuth0 = perfNowMs();
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sessionFp = await readActiveSessionFingerprintForUser(userId);
  const auth_cache_hit_before: 0 | 1 = peekAuthSessionValidateCached(userId, sessionFp) ? 1 : 0;
  const validated = await validateActiveSessionLightDeduped(userId, sessionFp);
  const auth_ms = Math.round(perfNowMs() - tAuth0);
  const auth_cache_hit: 0 | 1 =
    auth_cache_hit_before || validated.ttlCacheHit ? 1 : 0;
  if (!validated.ok) return validated.response;

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const menuSectionId = req.nextUrl.searchParams.get("menu_section_id")?.trim() ?? "";
  const sectionFilter = menuSectionId.length >= 8 ? menuSectionId : "";
  const limit = parseOwnerProductsListLimit(req.nextUrl.searchParams.get("limit"));
  // PRD-15 — `cursor` 는 서버가 적용하지 않던 미사용 파라미터라 제거 (전달돼도 무시·캐시 키 불변).
  const skipListCache = sectionFilter.length > 0 || limit != null;

  await sharedGenerationSync;
  const tCacheLookup0 = perfNowMs();
  const products_list_cache_hit_before: 0 | 1 =
    skipListCache ? 0 : peekOwnerProductsListCacheHit(id) ? 1 : 0;
  const ownership_cache_hit_before: 0 | 1 = peekOwnerStoreOwnershipCacheHit(userId, id) ? 1 : 0;
  const cache_lookup_ms = Math.round(perfNowMs() - tCacheLookup0);

  const tOwn0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(supabase, userId, id);
  const ownership_ms = Math.round(perfNowMs() - tOwn0);
  const ownership_cache_hit: 0 | 1 = ownership_cache_hit_before ? 1 : 0;
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const loaded = await loadOwnerProductsListSnapshot(supabase as import("@supabase/supabase-js").SupabaseClient<any>, id, {
    sectionFilter,
    limit,
    skipCache: skipListCache,
  });

  if (!loaded.ok) {
    return ownerCatalogDbErrorResponse("[GET products]", loaded.error);
  }

  const { snapshot } = loaded;
  const products_list_cache_hit: 0 | 1 = snapshot.cache_hit;
  const sections_cache_hit: 0 | 1 = products_list_cache_hit;
  const categories_cache_hit: 0 | 1 = products_list_cache_hit;
  const early_return_from_cache: 0 | 1 =
    auth_cache_hit === 1 && ownership_cache_hit === 1 && products_list_cache_hit === 1 ? 1 : 0;

  let actual_db_queries_count = 0;
  if (!auth_cache_hit) actual_db_queries_count += 2;
  if (!ownership_cache_hit) actual_db_queries_count += 1;
  if (!products_list_cache_hit) {
    actual_db_queries_count += 1;
    if (snapshot.timing.categories_query_ms > 0) actual_db_queries_count += 1;
    if (snapshot.timing.sections_query_ms > 0) actual_db_queries_count += 1;
  }

  const body = { ok: true as const, products: snapshot.products };
  const tSer0 = perfNowMs();
  const res = NextResponse.json(body);
  const serialization_ms = Math.round(perfNowMs() - tSer0);

  logOwnerProductsPerf({
    route: "owner_products_get",
    auth_ms,
    ownership_ms,
    products_query_ms: snapshot.timing.products_query_ms,
    categories_query_ms: snapshot.timing.categories_query_ms,
    sections_query_ms: snapshot.timing.sections_query_ms,
    payload_kb: jsonPayloadKb(body),
    product_count: snapshot.products.length,
    options_embed: snapshot.options_embed,
    images_embed: snapshot.images_embed,
    sort_ms: snapshot.timing.sort_ms,
    serialization_ms,
    total_ms: Math.round(perfNowMs() - wall0),
    cache_hit: products_list_cache_hit,
    singleflight_hit: snapshot.singleflight_hit,
    auth_cache_hit,
    ownership_cache_hit,
    products_list_cache_hit,
    sections_cache_hit,
    categories_cache_hit,
    early_return_from_cache,
    actual_db_queries_count,
    cache_lookup_ms,
  });

  return res;
}

/** 매장 승인 필수. `active` 상품은 판매 승인 필수, `draft`는 판매 승인 없이 생성 가능 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  // PRD-15 — 세션 · 전화 인증(등록 기존 규칙) · 소유 · 1-B 운영 게이트 (오너 상품·섹션·업로드 공용)
  const guard = await guardOwnerCatalogWrite(supabase, userId, sid, { requirePhone: true });
  if (!guard.ok) return guard.response;
  return createStoreProductCore(supabase, sid, ownerCatalogActor(userId), req);
}
