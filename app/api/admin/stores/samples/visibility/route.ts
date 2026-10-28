import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { ADMIN_REASON_REQUIRED_CODE } from "@/lib/admin/operator-ux/admin-reason";
import { ADMIN_STORE_REASON_MIN_LENGTH } from "@/lib/admin-business/admin-store-decision-rules";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  afterAdminSampleWrite,
  setAllAdminSampleStoresVisible,
} from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 샘플 전체 노출·숨김 (S-7). 노출 원천은 매장별 `is_visible` 하나 — 이 액션은 그 값을 일괄로 바꾼다.
 * Body: { visible: boolean, reason?: string } — 노출 켜기는 사유 필수
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { visible?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as { visible?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.visible !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_visible" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim();
  // 노출 켜기만 사유 필수 (매장 set_store_visible 과 같은 규칙 — exposeStart L2 · exposeStop L1)
  if (body.visible && reason.length < ADMIN_STORE_REASON_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const res = await setAllAdminSampleStoresVisible(sb, body.visible);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  for (let i = 0; i < res.storeIds.length; i++) {
    await afterAdminSampleWrite(sb, req, {
      actorId: gate.actor.userId,
      storeId: res.storeIds[i]!,
      slug: res.slugs[i] ?? null,
      action: body.visible ? "bulk_show" : "bulk_hide",
      after: { is_visible: body.visible, reason },
    });
  }
  return NextResponse.json({ ok: true, changed: res.storeIds.length });
}
