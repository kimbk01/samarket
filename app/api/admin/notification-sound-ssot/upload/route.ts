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

function extForSoundMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "bin";
}

async function nextCustomAssetId(sb: ReturnType<typeof getSupabaseServer>): Promise<string> {
  const { data } = await sb
    .from("notification_sound_assets")
    .select("id")
    .like("id", "DIBAY-SND-1%")
    .order("id", { ascending: false })
    .limit(1);
  const last = data?.[0]?.id as string | undefined;
  const n = last ? parseInt(last.replace("DIBAY-SND-", ""), 10) : 100;
  return `DIBAY-SND-${String(Number.isFinite(n) ? n + 1 : 101).padStart(3, "0")}`;
}

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

  const file = form.get("file");
  const labelRaw = form.get("label");
  const domainRaw = form.get("domain");
  const label = typeof labelRaw === "string" ? labelRaw.trim() : "Custom upload";
  const domain = typeof domainRaw === "string" ? domainRaw.trim() : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > SOUND_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (!SOUND_MIME.has(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_mime" }, { status: 400 });
  }

  const ext = extForSoundMime(mime);
  const path = `_admin/notification-sound-ssot/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from(SOUND_BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(SOUND_BUCKET).getPublicUrl(path);
  const fileUrl = pub?.publicUrl ?? null;
  const assetId = await nextCustomAssetId(sb);

  const { error: insErr } = await sb.from("notification_sound_assets").insert({
    id: assetId,
    label,
    kind: "dibay_custom",
    domain,
    file_url: fileUrl,
    legacy_source: { table: "upload", path, uploaded_by: admin.userId },
    enabled: true,
  });
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asset_id: assetId, file_url: fileUrl });
}
