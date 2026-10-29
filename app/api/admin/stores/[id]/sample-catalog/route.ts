import { NextRequest, NextResponse } from "next/server";
import { requireAdminSampleCatalogStore } from "@/lib/admin-business/admin-sample-catalog-gate.server";
import {
  patchStoreProfileCore,
  type StoreProfilePatchBody,
} from "@/lib/stores/owner-catalog/store-profile-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 3-C §9-3 — 관리자 샘플 매장 소개 조회 (편집 화면 초기값). */
export async function GET(_req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const { data, error } = await g.sb
    .from("stores")
    .select("id, store_name, slug, store_kind, description, profile_image_url, gallery_images_json, updated_at")
    .eq("id", g.store.id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, store: data });
}

/** 3-C §9-3 — 관리자 샘플 매장 소개 저장 = 오너 매장 정보 저장 코어 그대로. */
export async function PATCH(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  let body: StoreProfilePatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  // 감사 = 코어가 실제로 바뀐 필드만 `store.admin_sample_update`(actor_type admin)로 1건 (오너 store.owner_update 와 같은 diff 규칙).
  return patchStoreProfileCore({
    sb: g.sb,
    sid: g.store.id,
    actor: g.actor,
    gateStore: g.store,
    body,
    req,
  });
}
