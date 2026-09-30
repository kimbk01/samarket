import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { OS_ENTRY_STORAGE_BUCKET } from "@/lib/os-entry/defaults";
import { loadOsEntryLane, saveOsEntryDraft } from "@/lib/os-entry/db";
import { normalizeOsEntryConfig } from "@/lib/os-entry/normalize";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

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
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime) || mime.includes("gif")) {
    return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength <= 0 || buf.byteLength > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `draft/${admin.userId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await sb.storage.from(OS_ENTRY_STORAGE_BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(OS_ENTRY_STORAGE_BUCKET).getPublicUrl(path);

  const draft = await loadOsEntryLane(sb, "draft");
  if (!draft.ok) {
    await sb.storage.from(OS_ENTRY_STORAGE_BUCKET).remove([path]);
    return NextResponse.json({ ok: false, error: draft.message ?? draft.reason }, { status: 500 });
  }

  const next = normalizeOsEntryConfig({
    ...draft.config,
    imageUrl: publicUrl,
    imageStoragePath: path,
    imageSha256: sha256,
    imageMimeType: mime,
    imageByteLength: buf.byteLength,
  });

  const saved = await saveOsEntryDraft(sb, next, admin.userId);
  if (!saved.ok) {
    await sb.storage.from(OS_ENTRY_STORAGE_BUCKET).remove([path]);
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    draft: saved.config,
    imageUrl: publicUrl,
    imageStoragePath: path,
    imageSha256: sha256,
  });
}
