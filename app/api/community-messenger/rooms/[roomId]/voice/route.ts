import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { sendCommunityMessengerVoiceMessage } from "@/lib/community-messenger/service";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
]);

function extForMime(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base === "audio/webm") return "webm";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mp4" || base === "audio/m4a") return "m4a";
  if (base === "audio/aac") return "aac";
  return "webm";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_not_found" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "multipart_required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const rawMime = (file.type || "audio/webm").toLowerCase();
  const mimeBase = rawMime.split(";")[0]!.trim();
  if (!ALLOWED.has(rawMime) && !ALLOWED.has(mimeBase)) {
    return NextResponse.json({ ok: false, error: "unsupported_audio" }, { status: 400 });
  }

  let durationSeconds = Math.floor(Number(form.get("durationSeconds") ?? "0"));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) durationSeconds = 0;
  if (durationSeconds > 600) durationSeconds = 600;

  let waveformPeaks: number[] | undefined;
  const rawWaveform = form.get("waveformPeaks");
  if (typeof rawWaveform === "string" && rawWaveform.trim()) {
    try {
      const parsed = JSON.parse(rawWaveform) as unknown;
      if (Array.isArray(parsed)) {
        waveformPeaks = parsed
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
          .map((n) => Math.min(1, Math.max(0, n)));
      }
    } catch {
      /* ignore invalid waveform */
    }
  }

  const ext = extForMime(rawMime);
  /** `post-images` 정책이 보통 `{uid}/community/*` 만 허용하므로 동일 접두 사용 */
  const path = `${auth.userId}/community/messenger-voice/${roomId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("post-images").upload(path, buf, {
    contentType: mimeBase || "audio/webm",
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message ?? "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("post-images").getPublicUrl(path);

  const result = await sendCommunityMessengerVoiceMessage({
    userId: auth.userId,
    roomId,
    audioPublicUrl: publicUrl,
    storagePath: path,
    durationSeconds,
    mimeType: mimeBase || "audio/webm",
    waveformPeaks,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
