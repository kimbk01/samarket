import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  STORE_DELIVERY_ALERT_SOUND_KEY,
  fetchStoreDeliveryAlertSoundUrl,
  isValidStoreDeliverySoundUrlInput,
  parseStoreDeliverySoundUrl,
} from "@/lib/stores/store-delivery-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOUND_BUCKET = "store-order-sounds";
const SOUND_MAX_BYTES = 2 * 1024 * 1024;
const SOUND_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

function extForSoundMime(mime: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

/** 공개 URL → 버킷 `store-order-sounds` 내 object 경로 (해당 버킷이 아니면 null) */
function objectPathInStoreOrderSoundsFromPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  const m = u.match(/\/object\/public\/store-order-sounds\/(.+?)(?:\?|$)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

/** 관리자 업로드 분만 Storage에서 제거 (다른 URL은 건드리지 않음) */
async function removeAdminUploadedGlobalSoundIfPresent(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  publicUrl: string | null | undefined
): Promise<void> {
  const u = typeof publicUrl === "string" ? publicUrl.trim() : "";
  if (!u) return;
  const path = objectPathInStoreOrderSoundsFromPublicUrl(u);
  if (!path || !path.startsWith("_admin/global-delivery/")) return;
  const { error } = await sb.storage.from(SOUND_BUCKET).remove([path]);
  if (error) {
    console.warn("[removeAdminUploadedGlobalSoundIfPresent]", path, error.message);
  }
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: true, url: null, from_db: false });
    }
    console.error("[GET store-delivery-alert-sound]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const url = parseStoreDeliverySoundUrl(row?.value_json);
  return NextResponse.json({
    ok: true,
    url,
    from_db: row != null,
  });
}

/** 관리자: PC에서 선택한 오디오 → Storage 공개 URL 후 전역 admin_settings 반영 */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

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
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > SOUND_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }
  const mime = (file.type || "audio/mpeg").toLowerCase();
  if (!SOUND_MIME.has(mime)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_type",
        message: "MP3, WAV, OGG, WebM만 업로드할 수 있습니다.",
      },
      { status: 400 }
    );
  }

  const ext = extForSoundMime(mime);
  const path = `_admin/global-delivery/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(SOUND_BUCKET).upload(path, buf, {
    contentType: mime === "audio/mp3" ? "audio/mpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[POST store-delivery-alert-sound upload]", upErr);
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
            "Supabase에 버킷 store-order-sounds가 없습니다. 마이그레이션(매장 알림음)을 적용해 주세요.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(SOUND_BUCKET).getPublicUrl(path);

  if (!isValidStoreDeliverySoundUrlInput(publicUrl)) {
    return NextResponse.json({ ok: false, error: "invalid_public_url" }, { status: 500 });
  }

  const { data: prevRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
    .maybeSingle();
  const prevUrl = parseStoreDeliverySoundUrl(prevRow?.value_json);
  if (prevUrl && prevUrl !== publicUrl) {
    await removeAdminUploadedGlobalSoundIfPresent(sb, prevUrl);
  }

  const { error: dbErr } = await sb.from("admin_settings").upsert(
    {
      key: STORE_DELIVERY_ALERT_SOUND_KEY,
      value_json: { url: publicUrl },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (dbErr) {
    if (dbErr.message?.includes("admin_settings") && dbErr.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[POST store-delivery-alert-sound upsert]", dbErr);
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  const payload = { ok: true as const, url: publicUrl, from_db: true as const };
  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_delivery_alert_sound",
    target_id: "global",
    action: "store_delivery_alert_sound.upload",
    after_json: payload as unknown as Record<string, unknown>,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json(payload);
}

/** 전역 설정 행 삭제 + 관리자 업로드 파일이면 Storage에서 제거 */
export async function DELETE(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
    .maybeSingle();

  const prevUrl = parseStoreDeliverySoundUrl(row?.value_json);
  await removeAdminUploadedGlobalSoundIfPresent(sb, prevUrl);

  const { error } = await sb.from("admin_settings").delete().eq("key", STORE_DELIVERY_ALERT_SOUND_KEY);
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[DELETE store-delivery-alert-sound]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const payload = { ok: true as const, url: null as string | null, from_db: false as const };
  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_delivery_alert_sound",
    target_id: "global",
    action: "store_delivery_alert_sound.delete",
    after_json: payload as unknown as Record<string, unknown>,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json(payload);
}

type PutBody = { url?: string | null };

export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const raw = body.url;
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    const { data: row } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
      .maybeSingle();
    const prevUrl = parseStoreDeliverySoundUrl(row?.value_json);
    await removeAdminUploadedGlobalSoundIfPresent(sb, prevUrl);

    const { error } = await sb.from("admin_settings").delete().eq("key", STORE_DELIVERY_ALERT_SOUND_KEY);
    if (error) {
      if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      console.error("[PUT store-delivery-alert-sound delete]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    const url = String(raw).trim();
    if (!isValidStoreDeliverySoundUrlInput(url)) {
      return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
    }

    const { data: prevRow } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
      .maybeSingle();
    const prevUrl = parseStoreDeliverySoundUrl(prevRow?.value_json);
    if (prevUrl && prevUrl !== url) {
      await removeAdminUploadedGlobalSoundIfPresent(sb, prevUrl);
    }

    const { error } = await sb.from("admin_settings").upsert(
      {
        key: STORE_DELIVERY_ALERT_SOUND_KEY,
        value_json: { url },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      console.error("[PUT store-delivery-alert-sound upsert]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  const url = await fetchStoreDeliveryAlertSoundUrl(sb);
  const payload = { ok: true as const, url, from_db: url != null };

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_delivery_alert_sound",
    target_id: "global",
    action: "store_delivery_alert_sound.update",
    after_json: payload as unknown as Record<string, unknown>,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json(payload);
}
