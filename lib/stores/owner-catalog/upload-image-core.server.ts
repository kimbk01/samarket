/**
 * 3-C §9-3 — 매장 이미지 업로드 저장 코어 (오너 `/api/me/stores/[storeId]/upload-image` 본문 그대로).
 * multipart file → `store-product-images/{storeId}/{uuid}.l1.{ext}` + hero·feed 파생본 → 공개 URL (DB 미갱신).
 * 호출부가 권한(오너 소유·온보딩 게이트 / 관리자 business + 샘플)을 먼저 확인한다.
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceStoreOwnerImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { OWNER_PRODUCT_IMAGE_MAX_BYTES } from "@/lib/stores/owner-product-images";
import { resolveOwnerProductImageMimeForUpload } from "@/lib/stores/owner-product-image-mime-sniff.server";
import { uploadStoreProductWithHeroDerivative } from "@/lib/media/canonical-image-upload.server";
import { storeProductListDerivativeOriginalPath } from "@/lib/media/canonical-image-path";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";
import type { StoreCatalogActor } from "@/lib/stores/owner-catalog/store-catalog-actor";

/** 언어 재감사 2026-11-27: 크기 오류는 코드만 보낸다(한국어 `message` 없음) — 화면이 코드로 키 */
const DIMENSION_ERROR_CODES: ReadonlySet<string> = new Set(["image_dimension_too_large", "image_dimension_invalid"]);

export async function uploadStoreImageCore(
  sb: SupabaseClient<any>,
  sid: string,
  actor: StoreCatalogActor,
  req: Request
): Promise<NextResponse> {
  const upRl = await enforceStoreOwnerImageUploadQuota(actor.userId, sid);
  if (!upRl.ok) return upRl.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  // IMG-02: 함수 본문 한도 아래 상한(클라이언트가 먼저 축소). 문구는 클라이언트 i18n(file_too_large).
  if (file.size > OWNER_PRODUCT_IMAGE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const rawBuf = Buffer.from(await file.arrayBuffer());
  const mime = resolveOwnerProductImageMimeForUpload(
    file.type || "",
    file.name || "",
    rawBuf
  );
  if (!mime) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  let processed;
  try {
    processed = await processOwnerProductImageBuffer(rawBuf, mime);
  } catch (e) {
    const code = e instanceof Error ? e.message : "upload_failed";
    if (code === "invalid_type") {
      return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
    }
    if (DIMENSION_ERROR_CODES.has(code)) {
      return NextResponse.json({ ok: false, error: code, code }, { status: 400 });
    }
    console.error("[upload-image] process", e);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }

  // IMG-01: 목록 파생본(`feed`)을 함께 만드는 표식 경로 — 리졸버가 표식으로 파생본 사용 여부를 판정
  const path = storeProductListDerivativeOriginalPath(sid, randomUUID(), processed.ext);

  try {
    const result = await uploadStoreProductWithHeroDerivative({
      sb,
      originalPath: path,
      primaryBuf: processed.buf,
      primaryContentType: processed.contentType,
    });

    return NextResponse.json({
      ok: true,
      url: result.publicUrl,
      path: result.originalPath,
      width: processed.width,
      height: processed.height,
      heroPath: result.derivativePaths.hero ?? null,
    });
  } catch (upErr) {
    console.error("[upload-image]", upErr);
    const raw = String(upErr instanceof Error ? upErr.message : upErr ?? "");
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      (raw.toLowerCase().includes("not found") && raw.toLowerCase().includes("bucket"));
    if (bucketMissing) {
      /** 언어 재감사 2026-11-27: 개발 안내 문장은 화면에 보내지 않는다 — 버킷 추가 방법은 운영 로그(위)·마이그레이션 20260322213000 */
      return NextResponse.json(
        { ok: false, error: "storage_bucket_missing", code: "storage_bucket_missing" },
        { status: 503 }
      );
    }
    // PRD-15 — Storage 원문은 서버 로그만 (위 console.error)
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}
