/**
 * Common cover/media candidate validity — NOT site-specific.
 * Adapter extracts a candidate URL; this layer decides if it is a durable valid cover.
 *
 * COVER URL PRESENT ≠ COVER VALID
 */

import { assertPublicHttpUrlForCrawlFetch } from "@/lib/community-crawler/core/safe-url";

export type CoverCandidateValidation =
  | { ok: true; url: string; status: number; contentType: string; bytes: number }
  | {
      ok: false;
      candidate: string | null;
      reason:
        | "empty"
        | "invalid_url"
        | "blocked"
        | "http_error"
        | "content_type"
        | "empty_body"
        | "timeout"
        | "fetch_failed"
        | "redirect_blocked";
      status?: number;
      contentType?: string;
      bytes?: number;
    };

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 8_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT =
  "DIBAYCommunityCrawler/1.0 (+https://dibay.app; cover validate; contact=admin)";

function isImageContentType(ct: string): boolean {
  const c = ct.toLowerCase();
  if (!c) return false;
  if (c.startsWith("image/")) return true;
  // Some CDNs omit subtype params oddly; reject html/json explicitly.
  if (c.includes("text/html") || c.includes("application/json")) return false;
  return false;
}

/**
 * Validate that a cover candidate URL returns a real image payload.
 * Follows redirects with SSRF re-check on every hop (same policy as HTML fetch).
 */
export async function validateCoverImageCandidate(
  candidate: string | null | undefined,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }
): Promise<CoverCandidateValidation> {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (!raw) return { ok: false, candidate: null, reason: "empty" };

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let validated: URL;
    try {
      validated = await assertPublicHttpUrlForCrawlFetch(current);
    } catch {
      return {
        ok: false,
        candidate: raw,
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
        return { ok: false, candidate: raw, reason: "timeout" };
      }
      return {
        ok: false,
        candidate: raw,
        reason: "fetch_failed",
      };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { ok: false, candidate: raw, reason: "redirect_blocked", status: res.status };
      }
      try {
        current = new URL(loc, validated).toString();
      } catch {
        return { ok: false, candidate: raw, reason: "redirect_blocked", status: res.status };
      }
      continue;
    }

    const contentType = String(res.headers.get("content-type") ?? "");
    if (!res.ok) {
      // Drain lightly to free connection; ignore body errors.
      try {
        await res.arrayBuffer();
      } catch {
        /* */
      }
      return {
        ok: false,
        candidate: raw,
        reason: "http_error",
        status: res.status,
        contentType,
      };
    }

    if (!isImageContentType(contentType)) {
      try {
        await res.arrayBuffer();
      } catch {
        /* */
      }
      return {
        ok: false,
        candidate: raw,
        reason: "content_type",
        status: res.status,
        contentType,
      };
    }

    let bytes = 0;
    try {
      const buf = await readBodyLimited(res, maxBytes);
      bytes = buf.byteLength;
    } catch {
      return {
        ok: false,
        candidate: raw,
        reason: "empty_body",
        status: res.status,
        contentType,
      };
    }

    if (bytes <= 0) {
      return {
        ok: false,
        candidate: raw,
        reason: "empty_body",
        status: res.status,
        contentType,
        bytes: 0,
      };
    }

    return {
      ok: true,
      url: validated.toString(),
      status: res.status,
      contentType,
      bytes,
    };
  }

  return { ok: false, candidate: raw, reason: "redirect_blocked" };
}

/** Persist only validated covers; invalid candidates become null. */
export async function resolveDurableCoverUrl(
  candidate: string | null | undefined
): Promise<string | null> {
  const v = await validateCoverImageCandidate(candidate);
  return v.ok ? v.url : null;
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error("too_large");
    return new Uint8Array(ab);
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
        /* */
      }
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
