import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { enforceStoreOwnerImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { OWNER_PRODUCT_IMAGE_MAX_BYTES } from "@/lib/stores/owner-product-images";
import { resolveOwnerProductImageMimeForUpload } from "@/lib/stores/owner-product-image-mime-sniff.server";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIMENSION_ERROR_MESSAGES: Record<string, string> = {
  image_dimension_too_large:
    "이미지 가로·세로는 각 8192px 이하여야 합니다. 512×512 이상의 고해상도도 업로드할 수 있습니다.",
  image_dimension_invalid: "이미지 크기를 확인할 수 없습니다. 다른 파일로 시도해 주세요.",
};

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

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const upRl = await enforceStoreOwnerImageUploadQuota(userId, sid);
  if (!upRl.ok) return upRl.response;

  const st = gate.store.approval_status;
  const canUploadImage =
    st === "approved" ||
    st === "pending" ||
    st === "under_review" ||
    st === "revision_requested";
  if (!canUploadImage) {
    return NextResponse.json({ ok: false, error: "store_not_editable" }, { status: 400 });
  }

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
  if (file.size > OWNER_PRODUCT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "file_too_large",
        message: "이미지는 20MB 이하여야 합니다.",
      },
      { status: 413 }
    );
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

  const path = `${sid}/${randomUUID()}.${processed.ext}`;

  const { error: upErr } = await sb.storage
    .from("store-product-images")
    .upload(path, processed.buf, { contentType: processed.contentType, upsert: false });

  if (upErr) {
    console.error("[upload-image]", upErr);
    const raw = String(upErr.message ?? "");
    const code = (upErr as { statusCode?: string }).statusCode;
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      code === "404" ||
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
    return NextResponse.json(
      { ok: false, error: upErr.message || "upload_failed" },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("store-product-images").getPublicUrl(path);

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    path,
    width: processed.width,
    height: processed.height,
  });
}
