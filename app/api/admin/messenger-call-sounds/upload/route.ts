import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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

/** DB 컬럼명과 동일 — 업로드 대상 URL 필드만 허용 */
const UPLOADABLE_URL_KEYS = [
  "voice_incoming_sound_url",
  "voice_outgoing_ringback_url",
  "video_incoming_sound_url",
  "video_outgoing_ringback_url",
  "missed_notification_sound_url",
  "call_end_sound_url",
  "default_fallback_sound_url",
] as const;
type UploadableUrlKey = (typeof UPLOADABLE_URL_KEYS)[number];

function extForSoundMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "bin";
}

function objectPathFromStoreOrderSoundsPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  const m = u.match(/\/object\/public\/store-order-sounds\/(.+?)(?:\?|$)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

async function removePreviousUploadedSoundIfOwned(
  sb: ReturnType<typeof getSupabaseServer>,
  previousPublicUrl: string | null | undefined
): Promise<void> {
  const u = typeof previousPublicUrl === "string" ? previousPublicUrl.trim() : "";
  if (!u) return;
  const path = objectPathFromStoreOrderSoundsPublicUrl(u);
  if (!path || !path.startsWith("_admin/messenger-call-sounds/")) return;
  const { error } = await sb.storage.from(SOUND_BUCKET).remove([path]);
  if (error) {
    console.warn("[messenger-call-sounds upload remove prev]", path, error.message);
  }
}

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const urlKeyRaw = form.get("urlKey");
  const urlKey =
    typeof urlKeyRaw === "string" && (UPLOADABLE_URL_KEYS as readonly string[]).includes(urlKeyRaw)
      ? (urlKeyRaw as UploadableUrlKey)
      : null;
  if (!urlKey) {
    return NextResponse.json({ ok: false, error: "invalid_url_key" }, { status: 400 });
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
  const folder = urlKey.replace(/_url$/, "").replace(/_/g, "-");
  const path = `_admin/messenger-call-sounds/${folder}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(SOUND_BUCKET).upload(path, buf, {
    contentType: mime === "audio/mp3" ? "audio/mpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[messenger-call-sounds upload]", upErr);
    const raw = String(upErr.message ?? "");
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      (raw.toLowerCase().includes("not found") && raw.toLowerCase().includes("bucket"));
    if (bucketMissing) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          message: "Supabase에 버킷 store-order-sounds가 없거나 공개 읽기가 설정되지 않았습니다.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(SOUND_BUCKET).getPublicUrl(path);

  const { data: prevRow } = await sb
    .from("admin_messenger_call_sound_settings")
    .select(urlKey)
    .eq("id", "default")
    .maybeSingle();
  const prevUrl = prevRow ? (prevRow as Record<string, string | null>)[urlKey] : null;
  if (prevUrl && prevUrl !== publicUrl) {
    await removePreviousUploadedSoundIfOwned(sb, prevUrl);
  }

  const now = new Date().toISOString();
  const patch = { [urlKey]: publicUrl, updated_at: now } as Record<string, unknown>;

  const { data: existing } = await sb.from("admin_messenger_call_sound_settings").select("id").eq("id", "default").maybeSingle();

  if (existing) {
    const { error: dbErr } = await sb.from("admin_messenger_call_sound_settings").update(patch).eq("id", "default");
    if (dbErr) {
      if (dbErr.message?.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }
  } else {
    const baseRow = {
      id: "default" as const,
      voice_incoming_enabled: true,
      voice_incoming_sound_url: null as string | null,
      voice_outgoing_ringback_enabled: true,
      voice_outgoing_ringback_url: null as string | null,
      video_incoming_enabled: true,
      video_incoming_sound_url: null as string | null,
      video_outgoing_ringback_enabled: true,
      video_outgoing_ringback_url: null as string | null,
      missed_notification_enabled: true,
      missed_notification_sound_url: null as string | null,
      call_end_enabled: true,
      call_end_sound_url: null as string | null,
      use_custom_sounds: true,
      default_fallback_sound_url: null as string | null,
    };
    const insertPayload = { ...baseRow, ...patch, id: "default" as const };
    const { error: insErr } = await sb.from("admin_messenger_call_sound_settings").insert(insertPayload);
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, sound_url: publicUrl, urlKey });
}
