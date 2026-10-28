import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  updateStoreMenuSection,
  type StoreMenuSectionWriteBody,
} from "@/lib/stores/catalog/store-menu-section-write";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { afterAdminSampleWrite, requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — 샘플 매장 메뉴 구역 이름·정렬·숨김 (오너와 같은 카탈로그 코어) */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; sectionId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id, sectionId } = await context.params;
  const sid = String(id ?? "").trim();
  const secId = String(sectionId ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;

  let body: StoreMenuSectionWriteBody;
  try {
    body = (await req.json()) as StoreMenuSectionWriteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await updateStoreMenuSection(sb, sid, secId, body);
  if (result.status !== 200) return NextResponse.json(result.json, { status: result.status });
  invalidateOwnerProductsListCache(sid);
  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: sid,
    slug: sample.store.slug,
    action: "menu_section_update",
    after: { section_id: secId, fields: Object.keys(body) },
  });
  return NextResponse.json(result.json);
}
