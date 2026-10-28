import "server-only";

/**
 * 매장 상품 이미지 업로드 코어 — 오너 업로드 라우트 본문 그대로 이동 (2026-10-28 배달 감사 §F S-5).
 * 저장 경로(`store-product-images/{storeId}/…`)는 호출 라우트가 만든다. 응답 코드·메시지 불변.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNER_PRODUCT_IMAGE_MAX_BYTES } from "@/lib/stores/owner-product-images";
import { resolveOwnerProductImageMimeForUpload } from "@/lib/stores/owner-product-image-mime-sniff.server";
import { uploadStoreProductWithHeroDerivative } from "@/lib/media/canonical-image-upload.server";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";
import { outcome, type CatalogOutcome } from "@/lib/stores/catalog/store-catalog-write-policy";

const DIMENSION_ERROR_MESSAGES: Record<string, string> = {
  image_dimension_too_large:
    "이미지 가로·세로는 각 8192px 이하여야 합니다. 512×512 이상의 고해상도도 업로드할 수 있습니다.",
  image_dimension_invalid: "이미지 크기를 확인할 수 없습니다. 다른 파일로 시도해 주세요.",
};

type ProcessedStoreProductImage = Awaited<ReturnType<typeof processOwnerProductImageBuffer>>;

/** multipart `file` 검증·변환 (용량·형식·크기) */
export async function prepareStoreProductImageUpload(
  form: FormData
): Promise<{ ok: true; processed: ProcessedStoreProductImage } | { ok: false; outcome: CatalogOutcome }> {
  const fail = (status: number, json: Record<string, unknown>) =>
    ({ ok: false as const, outcome: outcome(status, json) });
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return fail(400, { ok: false, error: "file_required" });
  }
  // IMG-02: 함수 본문 한도 아래 상한(클라이언트가 먼저 축소). 문구는 클라이언트 i18n(file_too_large).
  if (file.size > OWNER_PRODUCT_IMAGE_MAX_BYTES) {
    return fail(413, { ok: false, error: "file_too_large" });
  }

  const rawBuf = Buffer.from(await file.arrayBuffer());
  const mime = resolveOwnerProductImageMimeForUpload(
    file.type || "",
    file.name || "",
    rawBuf
  );
  if (!mime) {
    return fail(400, { ok: false, error: "invalid_type" });
  }

  let processed;
  try {
    processed = await processOwnerProductImageBuffer(rawBuf, mime);
  } catch (e) {
    const code = e instanceof Error ? e.message : "upload_failed";
    if (code === "invalid_type") {
      return fail(400, { ok: false, error: "invalid_type" });
    }
    if (code in DIMENSION_ERROR_MESSAGES) {
      return fail(400, {
          ok: false,
          error: code,
          message: DIMENSION_ERROR_MESSAGES[code],
        });
    }
    console.error("[upload-image] process", e);
    return fail(500, { ok: false, error: "upload_failed" });
  }

  return { ok: true, processed };
}

/** 변환된 이미지 + 목록 파생본 업로드 → 공개 URL */
export async function uploadPreparedStoreProductImage(
  sb: SupabaseClient,
  path: string,
  processed: ProcessedStoreProductImage
): Promise<CatalogOutcome> {
  try {
    const result = await uploadStoreProductWithHeroDerivative({
      sb,
      originalPath: path,
      primaryBuf: processed.buf,
      primaryContentType: processed.contentType,
    });

    return outcome(200, {
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
      return outcome(503, {
          ok: false,
          error: "storage_bucket_missing",
          message:
            "Supabase Storage에 버킷 store-product-images가 없습니다. SQL Editor에서 storage.buckets에 추가하거나, 마이그레이션 20260322213000_storage_store_product_images_bucket.sql(또는 20250320210000)을 적용한 뒤 다시 시도해 주세요.",
        });
    }
    // PRD-15 — Storage 원문은 서버 로그만 (위 console.error)
    return outcome(500, { ok: false, error: "upload_failed" });
  }
}
