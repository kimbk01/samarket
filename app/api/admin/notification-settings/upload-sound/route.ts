import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { NOTIFICATION_DOMAINS } from "@/lib/notifications/notification-domains";

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
  const m = mime.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "bin";
}

/** 공개 URL → Storage object path (store-order-sounds 버킷) */
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
  if (!path || !path.startsWith("_admin/notification-domains/")) return;
  const { error } = await sb.storage.from(SOUND_BUCKET).remove([path]);
  if (error) {
    console.warn("[notification-settings upload-sound remove prev]", path, error.message);
  }
}

/**
 * POST multipart: `type` = trade_chat | community_chat | order | store, `file` = 오디오 파일
 * → Storage 업로드 후 `admin_notification_settings.sound_url` 갱신
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const typeRaw = form.get("type");
  const type =
    typeof typeRaw === "string" && NOTIFICATION_DOMAINS.includes(typeRaw as NotificationDomain)
      ? (typeRaw as NotificationDomain)
      : null;
  if (!type) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
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
  const path = `_admin/notification-domains/${type}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(SOUND_BUCKET).upload(path, buf, {
    contentType: mime === "audio/mp3" ? "audio/mpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[notification-settings upload-sound]", upErr);
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
            "Supabase에 버킷 store-order-sounds가 없거나 공개 읽기가 설정되지 않았습니다.",
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
    .from("admin_notification_settings")
    .select("sound_url")
    .eq("type", type)
    .maybeSingle();
  const prevUrl = (prevRow as { sound_url?: string | null } | null)?.sound_url;
  if (prevUrl && prevUrl !== publicUrl) {
    await removePreviousUploadedSoundIfOwned(sb, prevUrl);
  }

  const now = new Date().toISOString();
  const { error: dbErr } = await sb.from("admin_notification_settings").upsert(
    {
      type,
      sound_url: publicUrl,
      updated_at: now,
    },
    { onConflict: "type" }
  );

  if (dbErr) {
    if (dbErr.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[notification-settings upload-sound db]", dbErr);
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sound_url: publicUrl, type });
}
