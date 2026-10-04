/**
 * Outbound fetch for operator-import (server only).
 * - SSRF guard: only public hosts (same guard as remote image import)
 * - honest User-Agent, bounded timeout and size
 * - access blocks (403 / Cloudflare challenge / login wall) are reported, never bypassed
 */
import { assertPublicHttpUrlForImageFetch } from "@/lib/security/remote-image-import-url";

export const IMPORT_USER_AGENT = "DIBAY-CommunityImport/2.0 (+https://samarket.vercel.app; operator-reviewed)";
const MAX_BYTES = 4 * 1024 * 1024;

export type ImportFetchErrorCode =
  | "invalid_url"
  | "private_host"
  | "http_error"
  | "challenge"
  | "timeout"
  | "network"
  | "too_large";

export class ImportFetchError extends Error {
  readonly code: ImportFetchErrorCode;
  readonly status: number | null;
  readonly url: string;
  constructor(code: ImportFetchErrorCode, url: string, status: number | null, message?: string) {
    super(message || `${code}${status ? `_${status}` : ""}`);
    this.code = code;
    this.status = status;
    this.url = url;
  }
}

export type FetchedText = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
};

function looksLikeChallenge(status: number, text: string): boolean {
  if (status !== 403 && status !== 503 && status !== 429) return false;
  return /cf-chl|challenge-platform|just a moment|attention required|cf-browser-verification|captcha/i.test(
    text.slice(0, 20000),
  );
}

export async function fetchImportText(
  url: string,
  opts: { accept?: string; timeoutMs?: number; allowStatuses?: number[] } = {},
): Promise<FetchedText> {
  let parsed: URL;
  try {
    parsed = await assertPublicHttpUrlForImageFetch(url);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    throw new ImportFetchError(m === "private" || m === "bad_host" ? "private_host" : "invalid_url", url, null);
  }
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": IMPORT_USER_AGENT,
        Accept: opts.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    throw new ImportFetchError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", url, null);
  }
  try {
    await assertPublicHttpUrlForImageFetch(res.url || parsed.toString());
  } catch {
    throw new ImportFetchError("private_host", url, res.status);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new ImportFetchError("too_large", url, res.status);
  const text = new TextDecoder(detectCharset(res.headers.get("content-type"), buf)).decode(buf);
  if (looksLikeChallenge(res.status, text)) throw new ImportFetchError("challenge", url, res.status);
  const ok = res.ok || (opts.allowStatuses ?? []).includes(res.status);
  if (!ok) throw new ImportFetchError("http_error", url, res.status);
  return {
    url,
    finalUrl: res.url || parsed.toString(),
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    text,
  };
}

/** Korean community sites still serve EUC-KR; honor header or <meta charset>. */
function detectCharset(contentType: string | null, buf: ArrayBuffer): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || "")?.[1];
  let cs = fromHeader;
  if (!cs) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  }
  const norm = String(cs || "utf-8").toLowerCase();
  if (norm === "euc-kr" || norm === "ks_c_5601-1987" || norm === "cp949") return "euc-kr";
  try {
    new TextDecoder(norm);
    return norm;
  } catch {
    return "utf-8";
  }
}

export function describeFetchError(e: unknown): string {
  if (e instanceof ImportFetchError) {
    switch (e.code) {
      case "challenge":
        return `접근 차단(봇 확인 화면, HTTP ${e.status ?? "?"}) — 우회하지 않음`;
      case "http_error":
        return `HTTP ${e.status ?? "?"}`;
      case "timeout":
        return "응답 시간 초과";
      case "private_host":
        return "내부·사설 주소는 허용되지 않음";
      case "invalid_url":
        return "잘못된 URL";
      case "too_large":
        return "응답이 너무 큼";
      default:
        return "네트워크 오류";
    }
  }
  return e instanceof Error ? e.message : "알 수 없는 오류";
}
