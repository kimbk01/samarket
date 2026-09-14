/**
 * Ingest remote operator-import images into existing post-images ownership.
 * Reuses uploadPostImageWithDerivatives (same path as /api/community/upload-image-from-url).
 */
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPostImageWithDerivatives } from "@/lib/media/canonical-image-upload.server";
import { CANONICAL_POST_IMAGE_ALLOWED_MIMES } from "@/lib/media/canonical-image-contract";
import { isHeicOrHeifBuffer } from "@/lib/media/heic-decode.server";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { assertPublicHttpUrlForImageFetch } from "@/lib/security/remote-image-import-url";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set<string>(CANONICAL_POST_IMAGE_ALLOWED_MIMES);
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function detectMimeFromBytes(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const t = buf.toString("ascii", 3, 6);
    if (t === "87a" || t === "89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (isHeicOrHeifBuffer(buf)) return "image/heic";
  return null;
}

function normalizeHeaderMime(t: string | null): string | null {
  if (!t) return null;
  const s = t.split(";")[0]!.trim().toLowerCase();
  return ALLOWED.has(s) ? s : null;
}

export type IngestedOperatorImage = {
  sourceUrl: string;
  publicUrl: string;
  storagePath: string;
};

async function fetchRemoteImageBuffer(
  rawUrl: string,
  pageReferer?: string | null,
): Promise<{ buf: Buffer; mime: string }> {
  const urlStr = normalizeHttpUrlString(rawUrl);
  await assertPublicHttpUrlForImageFetch(urlStr);

  let referer = "";
  const rawRef = String(pageReferer || "").trim();
  if (rawRef) {
    try {
      const refN = normalizeHttpUrlString(rawRef);
      await assertPublicHttpUrlForImageFetch(refN);
      referer = refN;
    } catch {
      referer = "";
    }
  }
  if (!referer) {
    try {
      referer = new URL(urlStr).origin + "/";
    } catch {
      referer = "";
    }
  }

  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "User-Agent": BROWSER_UA,
  };
  if (referer) headers.Referer = referer;

  const res = await fetch(urlStr, {
    redirect: "follow",
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers,
  });
  if (!res.ok) throw new Error(`image_fetch_http_${res.status}`);
  await assertPublicHttpUrlForImageFetch(res.url);

  const ab = await res.arrayBuffer();
  if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) throw new Error("image_fetch_size");
  const buf = Buffer.from(ab);
  const mime = detectMimeFromBytes(buf) ?? normalizeHeaderMime(res.headers.get("content-type"));
  if (!mime || !ALLOWED.has(mime)) throw new Error("image_fetch_mime");
  return { buf, mime };
}

/** Ingest one remote URL into post-images under principal ownership. */
export async function ingestOperatorRemoteImage(input: {
  sb: SupabaseClient;
  ownerUserId: string;
  sourceUrl: string;
  pageReferer?: string | null;
}): Promise<IngestedOperatorImage> {
  const { buf, mime } = await fetchRemoteImageBuffer(input.sourceUrl, input.pageReferer);
  const ext =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  const path = `${input.ownerUserId}/community/import/${randomUUID()}.${ext}`;
  const result = await uploadPostImageWithDerivatives({
    sb: input.sb,
    originalPath: path,
    rawBuf: buf,
    mimeType: mime,
  });
  return {
    sourceUrl: input.sourceUrl,
    publicUrl: result.publicUrl,
    storagePath: result.originalPath,
  };
}

/**
 * Map applied image URLs → DIBAY public URLs (best-effort per image).
 * Failed ingest keeps source URL only as last resort so publish is not blocked by one bad asset —
 * callers should prefer all-DIBAY; we record failures.
 */
export async function ingestOperatorImageUrlList(input: {
  sb: SupabaseClient;
  ownerUserId: string;
  urls: string[];
  pageReferer?: string | null;
}): Promise<{
  mapped: IngestedOperatorImage[];
  publicUrls: string[];
  storagePaths: string[];
  failures: { url: string; error: string }[];
}> {
  const mapped: IngestedOperatorImage[] = [];
  const publicUrls: string[] = [];
  const storagePaths: string[] = [];
  const failures: { url: string; error: string }[] = [];

  for (const url of input.urls.slice(0, 40)) {
    try {
      const row = await ingestOperatorRemoteImage({
        sb: input.sb,
        ownerUserId: input.ownerUserId,
        sourceUrl: url,
        pageReferer: input.pageReferer,
      });
      mapped.push(row);
      publicUrls.push(row.publicUrl);
      storagePaths.push(row.storagePath);
    } catch (e) {
      failures.push({ url, error: e instanceof Error ? e.message : "ingest_failed" });
      // Do not keep external hotlink as success path — skip failed image
    }
  }

  return { mapped, publicUrls, storagePaths, failures };
}
