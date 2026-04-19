import { randomUUID } from "crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { buildMessengerImageVariantBuffers } from "@/lib/community-messenger/messenger-image-variants";
import { sendCommunityMessengerImageMessage } from "@/lib/community-messenger/service";
import type { CommunityMessengerImageSendItem } from "@/lib/community-messenger/types";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILES = 10;

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:image-upload:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "사진 업로드 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_image_upload_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const canonicalRoomId = canon.canonicalRoomId;

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

  const fromFiles = form.getAll("files").filter((v): v is File => v instanceof File);
  const single = form.get("file");
  const allFiles: File[] = fromFiles.length > 0 ? fromFiles : single instanceof File ? [single] : [];

  if (allFiles.length === 0) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (allFiles.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: "too_many_images" }, { status: 400 });
  }

  for (const file of allFiles) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
    }
    const mimeType = (file.type || "").toLowerCase().trim();
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ ok: false, error: "unsupported_image" }, { status: 400 });
    }
  }

  const bucket = sb.storage.from("post-images");
  const baseDir = `${auth.userId}/community/messenger-image/${canonicalRoomId}`;
  const uploaded: CommunityMessengerImageSendItem[] = [];

  for (const file of allFiles) {
    const mimeType = (file.type || "").toLowerCase().trim();
    const buf = Buffer.from(await file.arrayBuffer());
    const variants = await buildMessengerImageVariantBuffers({ buf, mimeType });
    const id = randomUUID();
    const origExt =
      mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/gif" ? "gif" : "jpg";
    const originalPath = `${baseDir}/${id}.${origExt}`;

    const uploadBinary = async (path: string, body: Buffer, contentType: string) => {
      const { error } = await bucket.upload(path, body, { contentType, upsert: false });
      if (error) throw new Error(error.message ?? "upload_failed");
    };

    try {
      if (variants.kind === "triple") {
        const thumbPath = `${baseDir}/${id}.thumb.webp`;
        const previewPath = `${baseDir}/${id}.preview.webp`;
        await uploadBinary(originalPath, variants.original, mimeType);
        await uploadBinary(thumbPath, variants.thumb, "image/webp");
        await uploadBinary(previewPath, variants.preview, "image/webp");
        const {
          data: { publicUrl: originalPublicUrl },
        } = bucket.getPublicUrl(originalPath);
        const {
          data: { publicUrl: chatPublicUrl },
        } = bucket.getPublicUrl(thumbPath);
        const {
          data: { publicUrl: previewPublicUrl },
        } = bucket.getPublicUrl(previewPath);
        uploaded.push({
          chatPublicUrl,
          previewPublicUrl,
          originalPublicUrl,
          originalStoragePath: originalPath,
          originalMimeType: mimeType,
        });
      } else {
        await uploadBinary(originalPath, variants.original, variants.originalMime);
        const {
          data: { publicUrl },
        } = bucket.getPublicUrl(originalPath);
        uploaded.push({
          chatPublicUrl: publicUrl,
          previewPublicUrl: publicUrl,
          originalPublicUrl: publicUrl,
          originalStoragePath: originalPath,
          originalMimeType: variants.originalMime,
        });
      }
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "upload_failed" },
        { status: 500 }
      );
    }
  }

  const result = await sendCommunityMessengerImageMessage({
    userId: auth.userId,
    roomId: canonicalRoomId,
    items: uploaded,
  });

  if (result.ok) {
    const bumpArgs = {
      rawRouteRoomId: canon.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: auth.userId,
      messageId: result.message?.id,
      messageCreatedAt: result.message?.createdAt,
      messageForBump: result.message ?? null,
    };
    after(async () => {
      try {
        await publishMessengerRoomBumpAfterMutation(bumpArgs);
      } catch {
        /* best-effort */
      }
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
