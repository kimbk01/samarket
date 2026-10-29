import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import {
  createMenuSectionCore,
  listMenuSectionsCore,
  parseCreateMenuSectionBody,
  type CreateMenuSectionBody,
} from "@/lib/stores/owner-catalog/menu-sections-core.server";

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

  // 3-C §9-3 — 저장 코어 공용 (관리자 샘플 라우트와 같은 함수)
  return listMenuSectionsCore(sb, sid);
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

  let body: CreateMenuSectionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseCreateMenuSectionBody(body);
  if (!parsed.ok) return parsed.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트 (오너 상품·섹션·업로드 공용)
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;

  return createMenuSectionCore(sb, sid, parsed.value);
}
