import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import { enforceStoreOwnerImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { storeProductListDerivativeOriginalPath } from "@/lib/media/canonical-image-path";
import {
  prepareStoreProductImageUpload,
  uploadPreparedStoreProductImage,
} from "@/lib/stores/catalog/store-product-image-upload-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** 매장 소유자 + 승인된 매장만. multipart file → 공개 URL (DB 미갱신). 512×512 이상 포함 고해상도 허용. */
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 게이트. 업로드는 매장 정보 편집과 같은 범위(승인·심사 중 허용, 반려·정지 차단).
  const guard = await guardOwnerCatalogWrite(sb, userId, sid, { scope: "profile" });
  if (!guard.ok) return guard.response;

  const upRl = await enforceStoreOwnerImageUploadQuota(userId, sid);
  if (!upRl.ok) return upRl.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  // S-5 — 검증·변환·업로드는 카탈로그 코어(오너·관리자 샘플 공용), 경로는 이 라우트
  const prepared = await prepareStoreProductImageUpload(form);
  if (!prepared.ok) return NextResponse.json(prepared.outcome.json, { status: prepared.outcome.status });
  const { processed } = prepared;

  // IMG-01: 목록 파생본(`feed`)을 함께 만드는 표식 경로 — 리졸버가 표식으로 파생본 사용 여부를 판정
  const path = storeProductListDerivativeOriginalPath(sid, randomUUID(), processed.ext);

  const uploaded = await uploadPreparedStoreProductImage(sb, path, processed);
  return NextResponse.json(uploaded.json, uploaded.status === 200 ? undefined : { status: uploaded.status });
}
