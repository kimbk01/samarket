import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import { assertPublicHttpUrlForCrawlFetch } from "@/lib/community-crawler/core/safe-url";

export type CrawlFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  bodyText: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT =
  "DIBAYCommunityCrawler/1.0 (+https://dibay.app; TEST crawl; contact=admin)";

export async function safeFetchHtml(
  urlString: string,
  opts?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    requireHtml?: boolean;
  }
): Promise<CrawlFetchResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const requireHtml = opts?.requireHtml !== false;

  let current = urlString;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let validated: URL;
    try {
      validated = await assertPublicHttpUrlForCrawlFetch(current);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "blocked";
      throw new CommunityCrawlError(
        hop === 0 ? "FETCH_BLOCKED" : "REDIRECT_BLOCKED",
        `URL blocked (${reason}): ${current}`
      );
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
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new CommunityCrawlError("FETCH_TIMEOUT", `Fetch timeout: ${current}`);
      }
      throw new CommunityCrawlError(
        "FETCH_BLOCKED",
        `Fetch failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new CommunityCrawlError("REDIRECT_BLOCKED", `Redirect without Location: ${current}`);
      }
      const next = (() => {
        try {
          return new URL(loc, validated).toString();
        } catch {
          return null;
        }
      })();
      if (!next) {
        throw new CommunityCrawlError("REDIRECT_BLOCKED", `Invalid redirect Location: ${loc}`);
      }
      current = next;
      continue;
    }

    if (!res.ok) {
      throw new CommunityCrawlError("HTTP_ERROR", `HTTP ${res.status} for ${validated.toString()}`);
    }

    const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
    if (requireHtml && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new CommunityCrawlError(
        "CONTENT_TYPE_INVALID",
        `Expected text/html, got: ${contentType || "(empty)"}`
      );
    }

    const buf = await readBodyLimited(res, maxBytes);
    const bodyText = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return {
      finalUrl: validated.toString(),
      status: res.status,
      contentType,
      bodyText,
    };
  }

  throw new CommunityCrawlError("REDIRECT_BLOCKED", `Too many redirects (>${maxRedirects})`);
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new CommunityCrawlError("RESPONSE_TOO_LARGE", `Response exceeds ${maxBytes} bytes`);
    }
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
      throw new CommunityCrawlError("RESPONSE_TOO_LARGE", `Response exceeds ${maxBytes} bytes`);
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
