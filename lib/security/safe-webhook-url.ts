/**
 * 서버가 fetch하는 웹훅 URL 검증 — 내부망·메타데이터 SSRF 완화.
 * 운영: https 만. 개발: 로컬 테스트용 http 는 ALLOW_INSECURE_WEBHOOK_URL=1 일 때만 localhost/127.0.0.1.
 */

const FETCH_WEBHOOK_ALLOW_HTTP_LOCAL =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_WEBHOOK_URL === "1";

function isPrivateOrMetadataHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h.includes("metadata.google")) return true;

  return false;
}

/**
 * @returns 정규화된 절대 URL 문자열, 불가 시 null
 */
export function parseSafeWebhookUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }

  const proto = u.protocol.toLowerCase();
  if (proto === "https:") {
    if (isPrivateOrMetadataHost(u.hostname)) return null;
    return u.href;
  }

  if (proto === "http:") {
    if (process.env.NODE_ENV === "production") return null;
    if (!FETCH_WEBHOOK_ALLOW_HTTP_LOCAL) return null;
    const hn = u.hostname.toLowerCase();
    if (hn !== "localhost" && hn !== "127.0.0.1") return null;
    return u.href;
  }

  return null;
}
