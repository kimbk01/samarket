import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 매장 소유자 + 승인된 매장만. multipart file → 공개 URL */
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
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${sid}/${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from("store-product-images")
    .upload(path, buf, { contentType: mime, upsert: false });

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

  return NextResponse.json({ ok: true, url: publicUrl, path });
}
