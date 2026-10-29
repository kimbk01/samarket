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

const DIMENSION_ERROR_MESSAGES: Record<string, string> = {
  image_dimension_too_large:
    "이미지 가로·세로는 각 8192px 이하여야 합니다. 512×512 이상의 고해상도도 업로드할 수 있습니다.",
  image_dimension_invalid: "이미지 크기를 확인할 수 없습니다. 다른 파일로 시도해 주세요.",
};

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
    if (code in DIMENSION_ERROR_MESSAGES) {
      return NextResponse.json(
        {
          ok: false,
          error: code,
          message: DIMENSION_ERROR_MESSAGES[code],
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          message:
            "Supabase Storage에 버킷 store-product-images가 없습니다. SQL Editor에서 storage.buckets에 추가하거나, 마이그레이션 20260322213000_storage_store_product_images_bucket.sql(또는 20250320210000)을 적용한 뒤 다시 시도해 주세요.",
        },
        { status: 503 }
      );
    }
    // PRD-15 — Storage 원문은 서버 로그만 (위 console.error)
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}
