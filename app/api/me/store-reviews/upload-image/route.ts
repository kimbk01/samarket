import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { uploadPostImageWithDerivatives } from "@/lib/media/canonical-image-upload.server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 구매자: 완료된 매장 주문 리뷰용 사진 — post-images + canonical derivatives. */
export async function POST(req: NextRequest) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const upRl = await enforceImageUploadQuota(buyerId, "store_review");
  if (!upRl.ok) return upRl.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const orderId = String(form.get("order_id") ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  if (order.buyer_user_id !== buyerId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (order.order_status !== "completed") {
    return NextResponse.json({ ok: false, error: "order_not_completed" }, { status: 400 });
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
  const path = `${buyerId}/store-reviews/${orderId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadPostImageWithDerivatives({
      sb,
      originalPath: path,
      rawBuf: buf,
      mimeType: mime,
    });
    return NextResponse.json({ ok: true, url: result.publicUrl, path: result.originalPath });
  } catch (e) {
    console.error("[store-reviews upload-image]", e);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}
