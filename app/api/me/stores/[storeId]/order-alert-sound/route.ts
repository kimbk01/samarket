import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export const dynamic = "force-dynamic";

const BUCKET = "store-order-sounds";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

function extForMime(mime: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

/** 오너: 현재 설정 URL */
export async function GET(
  _req: NextRequest,
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
  const { data: row, error } = await sb
    .from("stores")
    .select("order_alert_sound_url")
    .eq("id", sid)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("order_alert_sound_url") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: true, url: null });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const u = (row as { order_alert_sound_url?: string | null } | null)?.order_alert_sound_url;
  const url = typeof u === "string" && u.trim() ? u.trim() : null;
  return NextResponse.json({ ok: true, url });
}

/** 오너: PC에서 선택한 오디오 파일 업로드 후 매장에 적용 */
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
  const canUpload =
    st === "approved" || st === "pending" || st === "under_review" || st === "revision_requested";
  if (!canUpload) {
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
  const mime = (file.type || "audio/mpeg").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { ok: false, error: "invalid_type", message: "MP3, WAV, OGG, WebM만 업로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const ext = extForMime(mime);
  const path = `${sid}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: mime === "audio/mp3" ? "audio/mpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[order-alert-sound upload]", upErr);
    const raw = String(upErr.message ?? "");
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      (raw.toLowerCase().includes("not found") && raw.toLowerCase().includes("bucket"));
    if (bucketMissing) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          message:
            "Supabase에 버킷 store-order-sounds가 없습니다. 마이그레이션 20260326120000_stores_order_alert_sound.sql을 적용해 주세요.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(BUCKET).getPublicUrl(path);

  const { error: uErr } = await sb
    .from("stores")
    .update({ order_alert_sound_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .eq("owner_user_id", userId);

  if (uErr) {
    if (uErr.message?.includes("order_alert_sound_url") && uErr.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "column_missing", message: "DB 마이그레이션을 적용해 주세요." }, { status: 503 });
    }
    console.error("[order-alert-sound update store]", uErr);
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: publicUrl });
}

/** 오너: 매장 전용 알림음 제거 → 전역/비프로 복귀 */
export async function DELETE(
  _req: NextRequest,
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

  const { error: uErr } = await sb
    .from("stores")
    .update({ order_alert_sound_url: null, updated_at: new Date().toISOString() })
    .eq("id", sid)
    .eq("owner_user_id", userId);

  if (uErr) {
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: null });
}
