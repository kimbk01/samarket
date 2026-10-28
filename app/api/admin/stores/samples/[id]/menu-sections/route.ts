import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  insertStoreMenuSection,
  parseStoreMenuSectionCreateBody,
  type StoreMenuSectionWriteBody,
} from "@/lib/stores/catalog/store-menu-section-write";
import { afterAdminSampleWrite, requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 샘플 매장 메뉴 구역 추가 (오너와 같은 카탈로그 코어) */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id } = await context.params;
  const sid = String(id ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;

  let body: StoreMenuSectionWriteBody;
  try {
    body = (await req.json()) as StoreMenuSectionWriteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseStoreMenuSectionCreateBody(body);
  if (!parsed.ok) return NextResponse.json(parsed.outcome.json, { status: parsed.outcome.status });
  const result = await insertStoreMenuSection(sb, sid, parsed.row);
  if (result.status !== 200) return NextResponse.json(result.json, { status: result.status });
  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: sid,
    slug: sample.store.slug,
    action: "menu_section_create",
    after: { name: parsed.row.name },
  });
  return NextResponse.json(result.json);
}
