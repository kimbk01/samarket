/**
 * Safe crawl media fetch — stricter than cover candidate validation.
 * SSRF + redirect hops + max bytes + magic MIME + sharp decode + dimensions.
 * SVG never allowed. HEIC not accepted for crawl rehost (jpeg/png/webp/gif only).
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { assertPublicHttpUrlForImageFetch } from "@/lib/security/remote-image-import-url";

export const CRAWL_MEDIA_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type CrawlMediaMime = (typeof CRAWL_MEDIA_ALLOWED_MIMES)[number];

const ALLOWED = new Set<string>(CRAWL_MEDIA_ALLOWED_MIMES);
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_EDGE = 8192;
const DEFAULT_MAX_PIXELS = 40_000_000;
const USER_AGENT =
  "DIBAYCommunityCrawler/1.0 (+https://dibay.app; media rehost; contact=admin)";

export type SafeCrawlMediaFetchOk = {
  ok: true;
  sourceUrl: string;
  finalUrl: string;
  buf: Buffer;
  mime: CrawlMediaMime;
  byteSize: number;
  width: number;
  height: number;
  contentHash: string;
};

export type SafeCrawlMediaFetchFail = {
  ok: false;
  sourceUrl: string | null;
  reason:
    | "empty"
    | "blocked"
    | "redirect_blocked"
    | "http_error"
    | "timeout"
    | "fetch_failed"
    | "too_large"
    | "empty_body"
    | "mime_rejected"
    | "decode_failed"
    | "zero_dimension"
    | "dimension_limit";
  status?: number;
  contentType?: string;
};

export type SafeCrawlMediaFetchResult = SafeCrawlMediaFetchOk | SafeCrawlMediaFetchFail;

function detectMimeFromBytes(buf: Buffer): CrawlMediaMime | null {
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
  // Explicit SVG reject (text or xml sniff)
  const head = buf.subarray(0, Math.min(256, buf.length)).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("image/svg")) return null;
  return null;
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("too_large");
    return Buffer.from(ab);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function safeFetchCrawlMediaBytes(
  candidate: string | null | undefined,
  opts?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    maxEdge?: number;
    maxPixels?: number;
  }
): Promise<SafeCrawlMediaFetchResult> {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (!raw) return { ok: false, sourceUrl: null, reason: "empty" };

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxPixels = opts?.maxPixels ?? DEFAULT_MAX_PIXELS;

  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let validated: URL;
    try {
      validated = await assertPublicHttpUrlForImageFetch(current);
    } catch {
      return {
        ok: false,
        sourceUrl: raw,
        reason: hop === 0 ? "blocked" : "redirect_blocked",
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(validated.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, sourceUrl: raw, reason: "timeout" };
      }
      return { ok: false, sourceUrl: raw, reason: "fetch_failed" };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, sourceUrl: raw, reason: "redirect_blocked", status: res.status };
      try {
        current = new URL(loc, validated).toString();
      } catch {
        return { ok: false, sourceUrl: raw, reason: "redirect_blocked", status: res.status };
      }
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        sourceUrl: raw,
        reason: "http_error",
        status: res.status,
        contentType: res.headers.get("content-type") ?? undefined,
      };
    }

    const cl = res.headers.get("content-length");
    if (cl) {
      const n = parseInt(cl, 10);
      if (!Number.isNaN(n) && n > maxBytes) {
        return { ok: false, sourceUrl: raw, reason: "too_large", status: res.status };
      }
    }

    let buf: Buffer;
    try {
      buf = await readBodyLimited(res, maxBytes);
    } catch {
      return { ok: false, sourceUrl: raw, reason: "too_large", status: res.status };
    }
    if (buf.byteLength === 0) {
      return { ok: false, sourceUrl: raw, reason: "empty_body", status: res.status };
    }

    const mime = detectMimeFromBytes(buf);
    if (!mime || !ALLOWED.has(mime)) {
      return {
        ok: false,
        sourceUrl: raw,
        reason: "mime_rejected",
        status: res.status,
        contentType: res.headers.get("content-type") ?? undefined,
      };
    }

    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(buf, {
        failOn: "error",
        limitInputPixels: maxPixels,
      }).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch {
      return { ok: false, sourceUrl: raw, reason: "decode_failed", status: res.status };
    }

    if (width <= 0 || height <= 0) {
      return { ok: false, sourceUrl: raw, reason: "zero_dimension", status: res.status };
    }
    if (width > maxEdge || height > maxEdge) {
      return { ok: false, sourceUrl: raw, reason: "dimension_limit", status: res.status };
    }

    const contentHash = createHash("sha256").update(buf).digest("hex");
    return {
      ok: true,
      sourceUrl: raw,
      finalUrl: validated.toString(),
      buf,
      mime,
      byteSize: buf.byteLength,
      width,
      height,
      contentHash,
    };
  }

  return { ok: false, sourceUrl: raw, reason: "redirect_blocked" };
}

export function crawlMediaExtForMime(mime: CrawlMediaMime): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export function buildCrawlMediaStoragePath(input: {
  sourceId: string;
  crawlItemId: string;
  contentHash: string;
  ext: string;
}): string {
  return `community-crawler/${input.sourceId}/${input.crawlItemId}/${input.contentHash}.${input.ext}`;
}
