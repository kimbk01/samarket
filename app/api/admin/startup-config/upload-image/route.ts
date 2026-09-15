import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import {
  PRODUCT_INTRO_MAX_FILE_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_BYTES,
} from "@/lib/startup/product-intro-geometry";
import { optimizeProductIntroCreativeBuffer } from "@/lib/startup/product-intro-optimize.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reuse campaign image bucket — path prefix isolates startup assets. */
const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart: kind=logo|background|product|product_tablet, file
 * Returns public HTTPS URL for Startup / Product Intro storage (not a local path).
 *
 * product / product_tablet: Admin-time sharp → canonical 1080×1350 WebP (immutable UUID URL).
 * logo / background: passthrough with legacy 2MB ceiling (no First Entry optimize).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind =
    kindRaw === "logo" ||
    kindRaw === "background" ||
    kindRaw === "product" ||
    kindRaw === "product_tablet"
      ? kindRaw
      : null;
  const file = form.get("file");
  if (!kind || !file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const isProductKind = kind === "product" || kind === "product_tablet";
  const maxBytes = isProductKind ? PRODUCT_INTRO_MAX_SOURCE_BYTES : PRODUCT_INTRO_MAX_FILE_BYTES;
  const validated = validateCampaignImageFile(file, { maxBytes });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const folder =
    kind === "product" || kind === "product_tablet"
      ? `_admin/startup/product/${kind === "product_tablet" ? "tablet" : "mobile"}`
      : `_admin/startup/${kind}`;

  const sourceBuf = Buffer.from(await file.arrayBuffer());
  let uploadBuf: Buffer = sourceBuf;
  let contentType: string =
    validated.mime === "image/jpg" ? "image/jpeg" : validated.mime;
  let ext = extForCampaignImageMime(validated.mime);
  let optimizeMeta:
    | {
        originalBytes: number;
        outputBytes: number;
        width: number;
        height: number;
        sourceWidth: number;
        sourceHeight: number;
      }
    | undefined;

  if (isProductKind) {
    const optimized = await optimizeProductIntroCreativeBuffer({
      buffer: sourceBuf,
      sourceBytes: sourceBuf.length,
    });
    if (!optimized.ok) {
      return NextResponse.json({ ok: false, error: optimized.error }, { status: 400 });
    }
    uploadBuf = optimized.buffer;
    contentType = optimized.contentType;
    ext = optimized.ext;
    optimizeMeta = {
      originalBytes: optimized.sourceBytes,
      outputBytes: optimized.outputBytes,
      width: optimized.width,
      height: optimized.height,
      sourceWidth: optimized.sourceWidth,
      sourceHeight: optimized.sourceHeight,
    };
  }

  const path = `${folder}/${randomUUID()}.${ext}`;
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, uploadBuf, {
    contentType,
    upsert: false,
  });

  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found/i.test(raw)) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    ok: true as const,
    kind,
    url: publicUrl,
    ...(optimizeMeta
      ? {
          optimized: true as const,
          originalBytes: optimizeMeta.originalBytes,
          outputBytes: optimizeMeta.outputBytes,
          width: optimizeMeta.width,
          height: optimizeMeta.height,
          sourceWidth: optimizeMeta.sourceWidth,
          sourceHeight: optimizeMeta.sourceHeight,
          contentType,
        }
      : { optimized: false as const }),
  });
}
