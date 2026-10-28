import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { afterAdminSampleWrite, requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";
import {
  buildAdminSampleOperationsPatch,
  hasAdminSampleOperationsFields,
  type AdminSampleOperationsInput,
} from "@/lib/stores/sample/admin-sample-store-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — 샘플 매장 소개·대표/커버 이미지 · 운영 설정(HC-1: 배달·포장·배달비·최소주문·무료배달 기준·조리시간·영업시간).
 * 이름·업종·노출은 기존 `PATCH /api/admin/stores/[id]` 액션을 쓴다.
 * Body: { description?, profileImageUrl?, coverImageUrl?, deliveryAvailable?, pickupAvailable?, deliveryFeePhp?, minOrderPhp?,
 *        freeDeliveryOverPhp?, prepTimeMinutes?, openTime?, closeTime? }
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id } = await context.params;
  const sid = String(id ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;

  let body: { description?: unknown; profileImageUrl?: unknown; coverImageUrl?: unknown } & AdminSampleOperationsInput;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.description !== undefined) {
    patch.description = body.description == null ? null : String(body.description).trim().slice(0, 2000) || null;
  }
  if (body.profileImageUrl !== undefined) {
    patch.profile_image_url = body.profileImageUrl ? String(body.profileImageUrl).trim() : null;
  }
  if (body.coverImageUrl !== undefined) {
    patch.cover_image_url = body.coverImageUrl ? String(body.coverImageUrl).trim() : null;
  }
  if (hasAdminSampleOperationsFields(body)) {
    const { data: current, error: curErr } = await sb
      .from("stores")
      .select("business_hours_json, lat, lng")
      .eq("id", sid)
      .eq("store_kind", "sample")
      .maybeSingle();
    if (curErr || !current) return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    const ops = buildAdminSampleOperationsPatch(current, body);
    if (!ops.ok) return NextResponse.json({ ok: false, error: ops.error }, { status: 400 });
    Object.assign(patch, ops.patch);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }
  const { error } = await sb.from("stores").update(patch).eq("id", sid).eq("store_kind", "sample");
  if (error) {
    console.error("[admin sample PATCH]", error);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }
  await afterAdminSampleWrite(sb, req, {
    actorId: gate.actor.userId,
    storeId: sid,
    slug: sample.store.slug,
    action: hasAdminSampleOperationsFields(body) ? "operations_update" : "profile_update",
    after: patch,
  });
  return NextResponse.json({ ok: true });
}
