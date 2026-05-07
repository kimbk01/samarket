import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "store-taxonomy-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

/** 공개 URL → Storage object path (store-taxonomy-images 버킷) */
function objectPathFromPublicUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  const m = u.match(/\/object\/public\/store-taxonomy-images\/(.+?)(?:\?|$)/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

async function removePreviousIfOwned(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  previousUrl: string | null | undefined
): Promise<void> {
  const u = typeof previousUrl === "string" ? previousUrl.trim() : "";
  if (!u) return;
  const path = objectPathFromPublicUrl(u);
  if (!path || !path.startsWith("_admin/store-taxonomy/")) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn("[admin taxonomy upload-image remove prev]", path, error.message);
  }
}

/**
 * POST multipart: kind=category|topic, id, file
 * → Storage 업로드 후 store_categories/store_topics.image_url 갱신
 */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind = kindRaw === "category" || kindRaw === "topic" ? kindRaw : null;
  const idRaw = form.get("id");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!kind || !id) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const ext = extForMime(mime);
  const path = `_admin/store-taxonomy/${kind}/${id}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: mime === "image/jpg" ? "image/jpeg" : mime,
    upsert: false,
  });

  if (upErr) {
    console.error("[admin taxonomy upload-image]", upErr);
    const raw = String(upErr.message ?? "");
    const bucketMissing =
      /bucket not found/i.test(raw) ||
      (raw.toLowerCase().includes("not found") && raw.toLowerCase().includes("bucket"));
    if (bucketMissing) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage_bucket_missing",
          message: "Supabase에 버킷 store-taxonomy-images가 없거나 공개 읽기가 설정되지 않았습니다.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = sb.storage.from(BUCKET).getPublicUrl(path);

  const table = kind === "category" ? "store_categories" : "store_topics";
  const { data: prevRow } = await sb.from(table).select("image_url").eq("id", id).maybeSingle();
  const prevUrl = (prevRow as { image_url?: string | null } | null)?.image_url ?? null;

  const { data: updated, error: dbErr } = await sb
    .from(table)
    .update({ image_url: publicUrl })
    .eq("id", id)
    .select("id, image_url")
    .maybeSingle();

  if (dbErr) {
    console.error("[admin taxonomy upload-image db]", dbErr);
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (prevUrl && prevUrl !== publicUrl) {
    await removePreviousIfOwned(sb, prevUrl);
  }

  return NextResponse.json({ ok: true, kind, id, url: publicUrl });
}

