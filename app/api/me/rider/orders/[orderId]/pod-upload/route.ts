import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { enforceImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getDeliveryRiderForUser } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "delivery-proofs";

/** 라이더 POD·실패 증빙 이미지 → 경로 store-deliveries/{orderId}/{ts}-{uuid}.ext */
export async function POST(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const upRl = await enforceImageUploadQuota(userId, "rider_pod");
  if (!upRl.ok) return upRl.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const riderGate = await getDeliveryRiderForUser(sb, userId);
  if (!riderGate.ok) {
    return NextResponse.json({ ok: false, error: riderGate.error }, { status: riderGate.httpStatus });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") ?? "delivery_proof").trim();
  const kind = kindRaw === "failure_report" ? "failure_report" : "delivery_proof";

  const { data: row, error: rowErr } = await sb
    .from("store_order_deliveries")
    .select("rider_id, delivery_status, rider_failure_reported_at")
    .eq("order_id", oid)
    .maybeSingle();

  if (rowErr) return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: "delivery_not_found" }, { status: 404 });
  if (safeTrim((row as { rider_id?: string | null }).rider_id) !== riderGate.rider.id) {
    return NextResponse.json({ ok: false, error: "rider_not_assigned_to_order" }, { status: 403 });
  }

  const st = safeTrim((row as { delivery_status?: string }).delivery_status);
  if (st !== "pickup_in_progress" && st !== "delivering") {
    return NextResponse.json({ ok: false, error: "pod_upload_bad_delivery_status" }, { status: 409 });
  }
  if (kind === "failure_report" && (row as { rider_failure_reported_at?: string | null }).rider_failure_reported_at) {
    return NextResponse.json({ ok: false, error: "failure_report_already_submitted" }, { status: 409 });
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
  const path = `store-deliveries/${oid}/${Date.now()}-${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found|not found/i.test(raw)) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          hint: "delivery-proofs 버킷 및 마이그레이션(20260519120000, 20260520120000) 적용 여부를 확인하세요.",
        },
        { status: 503 }
      );
    }
    console.error("[rider pod-upload]", upErr);
    return NextResponse.json({ ok: false, error: raw || "upload_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path, kind });
}

function safeTrim(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}
