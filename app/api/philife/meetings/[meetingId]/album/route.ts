import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { MeetingAlbumItemDTO } from "@/lib/neighborhood/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALBUM_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALBUM_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

/** GET /api/philife/meetings/[meetingId]/album — 앨범 목록 (승인된 멤버 전용) */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: memberRow } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .maybeSingle();
  if (!(memberRow as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("meeting_album_items")
    .select("id, meeting_id, uploader_user_id, image_url, caption, is_hidden, created_at")
    .eq("meeting_id", id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const items = (data ?? []).map((row: Record<string, unknown>): MeetingAlbumItemDTO => ({
    id: String(row.id),
    meeting_id: String(row.meeting_id ?? id),
    uploader_user_id: String(row.uploader_user_id ?? ""),
    uploader_name: String(row.uploader_user_id ?? "").slice(0, 8),
    image_url: row.image_url != null ? String(row.image_url) : null,
    caption: row.caption != null ? String(row.caption) : null,
    is_hidden: !!row.is_hidden,
    created_at: String(row.created_at ?? ""),
  }));

  return NextResponse.json({ ok: true, items });
}

/** POST /api/philife/meetings/[meetingId]/album — 앨범 사진 업로드 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "multipart 필요" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file 필드 필요" }, { status: 400 });
  }
  if (file.size > ALBUM_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "8MB 이하 사진만 업로드 가능합니다." }, { status: 413 });
  }
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!ALBUM_ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "JPEG, PNG, WebP, HEIC만 가능합니다." }, { status: 400 });
  }

  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  // 멤버 확인 + allow_album_upload 체크
  const [{ data: memberRow }, { data: meetingRow }] = await Promise.all([
    sb
      .from("meeting_members")
      .select("id")
      .eq("meeting_id", id)
      .eq("user_id", auth.userId)
      .eq("status", "joined")
      .maybeSingle(),
    sb
      .from("meetings")
      .select("allow_album_upload")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!(memberRow as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if ((meetingRow as { allow_album_upload?: boolean } | null)?.allow_album_upload === false) {
    return NextResponse.json({ ok: false, error: "upload_not_allowed" }, { status: 403 });
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/heic" ? "heic" : "jpg";
  const storagePath = `${auth.userId}/meeting-album/${id}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from("post-images").upload(storagePath, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message ?? "업로드 실패" }, { status: 500 });
  }

  const { data: { publicUrl } } = sb.storage.from("post-images").getPublicUrl(storagePath);

  const { data: inserted, error: dbErr } = await sb
    .from("meeting_album_items")
    .insert({
      meeting_id: id,
      uploader_user_id: auth.userId,
      image_url: publicUrl,
      caption,
    })
    .select("id, meeting_id, uploader_user_id, image_url, caption, is_hidden, created_at")
    .single();

  if (dbErr || !inserted) {
    // 스토리지 롤백
    await sb.storage.from("post-images").remove([storagePath]);
    return NextResponse.json({ ok: false, error: dbErr?.message ?? "DB 오류" }, { status: 500 });
  }

  const row = inserted as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    item: {
      id: String(row.id),
      meeting_id: String(row.meeting_id ?? id),
      uploader_user_id: auth.userId,
      uploader_name: auth.userId.slice(0, 8),
      image_url: publicUrl,
      caption,
      is_hidden: false,
      created_at: String(row.created_at ?? new Date().toISOString()),
    } satisfies MeetingAlbumItemDTO,
  });
}
