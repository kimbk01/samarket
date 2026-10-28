import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  insertStoreMenuSection,
  parseStoreMenuSectionCreateBody,
  type StoreMenuSectionWriteBody,
} from "@/lib/stores/catalog/store-menu-section-write";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  guardOwnerCatalogWrite,
  ownerCatalogDbErrorResponse,
} from "@/lib/stores/owner-catalog-write-guard";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 메뉴 카테고리(store_menu_sections) 목록 */
export async function GET(
  _req: Request,
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, sections: [], meta: { source: "supabase_unconfigured" } });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from("store_menu_sections")
    .select("id, name, sort_order, description, is_hidden")
    .eq("store_id", sid)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (/column|does not exist|schema cache/i.test(String(error.message))) {
      return NextResponse.json({
        ok: true,
        sections: [],
        meta: { source: "migration_pending", hint: "store_menu_sections" },
      });
    }
    return ownerCatalogDbErrorResponse("[GET menu-sections]", error);
  }

  return NextResponse.json({ ok: true, sections: data ?? [], meta: { source: "supabase" } });
}


/** 매장 오너: 메뉴 카테고리 추가 */
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

  let body: StoreMenuSectionWriteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // S-5 — 검증·저장은 카탈로그 코어(오너·관리자 샘플 공용)
  const parsed = parseStoreMenuSectionCreateBody(body);
  if (!parsed.ok) return NextResponse.json(parsed.outcome.json, { status: parsed.outcome.status });

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트 (오너 상품·섹션·업로드 공용)
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;

  const result = await insertStoreMenuSection(sb, sid, parsed.row);
  if (result.status !== 200) return NextResponse.json(result.json, { status: result.status });

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_create"); // OPS-02
  return NextResponse.json(result.json);
}
