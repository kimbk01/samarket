import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { registerIntroAdminAsset } from "@/lib/startup/intro-v2/admin-service";
import {
  INTRO_ADMIN_UPLOAD_BUCKET,
  INTRO_ADMIN_UPLOAD_FOLDER,
  inspectIntroUploadFile,
  introUploadExtForMime,
} from "@/lib/startup/intro-v2/admin-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDim(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  return Math.round(n);
}

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;

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

  const inspected = inspectIntroUploadFile(file);
  if (!inspected.ok) {
    return NextResponse.json({ ok: false, error: inspected.error }, { status: 400 });
  }

  const contentType = inspected.mime === "image/jpg" ? "image/jpeg" : inspected.mime;
  const ext = introUploadExtForMime(contentType);
  const path = `${INTRO_ADMIN_UPLOAD_FOLDER}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await ctx.sb.storage.from(INTRO_ADMIN_UPLOAD_BUCKET).upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found/i.test(raw)) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = ctx.sb.storage.from(INTRO_ADMIN_UPLOAD_BUCKET).getPublicUrl(path);

  const registered = await registerIntroAdminAsset(ctx.sb, {
    publicUrl,
    storagePath: path,
    mime: contentType,
    bytes: file.size,
    width: parseDim(form.get("width")),
    height: parseDim(form.get("height")),
  });
  if (!registered.ok) {
    return NextResponse.json({ ok: false, error: registered.error }, { status: registered.httpStatus });
  }

  return NextResponse.json({
    ok: true as const,
    url: publicUrl,
    asset: registered.asset,
  });
}
