/**
 * Scope B — single link / CTA contract (DestinationRef).
 *
 * One vocabulary for admin input, preview, server payload, app router and every CTA surface
 * (notification campaign, promotion popup / modal, banners, feed ads, event board).
 * Pure module: safe on server and client.
 *
 * - internal_route: same-origin app path only (no "//host", backslash, control chars).
 *   Member-facing surfaces may not deep-link into /admin or /stores/owner.
 * - external_url:   https only. Opened outside the app WebView (in-app browser).
 *   D-4 (Owner 조건부 승인 · 「설계안대로」 2026-11-04) 안전 검사: 계정 정보(`user@`) · IP·localhost·`.local`·사설 이름 ·
 *   2,048자 초과 · 단축·리다이렉트 서비스(`EXTERNAL_URL_SHORTENER_HOSTS`) 거부. 한글 등 비ASCII 도메인은
 *   punycode(`xn--`)로 정규화해 저장·표시한다. 저장 때와 고객 응답 만들 때 모두 이 함수로 거른다.
 *   서버가 리다이렉트를 직접 따라가 보지는 않는다(SSRF 위험).
 * - event:          platform event → canonical /events/:id.
 */
import { resolveSameOriginPushRoutePath } from "@/lib/push/push-route-policy";

export type DestinationRef =
  | { kind: "internal_route"; path: string }
  | { kind: "external_url"; url: string }
  | { kind: "event"; eventId: string };

export type DestinationError =
  | "destination_empty"
  | "invalid_internal_path"
  | "internal_path_forbidden"
  | "invalid_url"
  | "https_required"
  | "event_id_required"
  /** D-4 ① 주소에 계정 정보(user@) */
  | "external_url_credentials"
  /** D-4 ② IP 주소·localhost·.local·점 없는 사설 이름 */
  | "external_url_private_host"
  /** D-4 ③ 2,048자 초과 */
  | "external_url_too_long"
  /** D-4 ⑤ 단축·리다이렉트 서비스 — 최종 주소를 넣어야 한다 */
  | "external_url_shortener";

export type DestinationParseResult = { ok: true; ref: DestinationRef } | { ok: false; error: DestinationError };

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;
const MEMBER_FORBIDDEN_PREFIXES = ["/admin", "/stores/owner"];
const EVENT_PATH = /^\/events\/([^/?#]+)\/?(?:[?#].*)?$/;

export function eventDestinationPath(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

function checkInternalPath(raw: string, opts?: { allowAdmin?: boolean }): DestinationParseResult {
  const path = resolveSameOriginPushRoutePath(raw);
  if (!path || BLOCKED_SCHEMES.test(raw.trim())) return { ok: false, error: "invalid_internal_path" };
  if (!opts?.allowAdmin) {
    const lower = path.toLowerCase();
    if (MEMBER_FORBIDDEN_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}/`) || lower.startsWith(`${p}?`))) {
      return { ok: false, error: "internal_path_forbidden" };
    }
  }
  const ev = EVENT_PATH.exec(path);
  if (ev) {
    try {
      return { ok: true, ref: { kind: "event", eventId: decodeURIComponent(ev[1]) } };
    } catch {
      return { ok: false, error: "invalid_internal_path" };
    }
  }
  return { ok: true, ref: { kind: "internal_route", path } };
}

/** D-4 ③ 외부 주소 최대 길이 */
export const EXTERNAL_URL_MAX_LENGTH = 2048;

/**
 * D-4 ⑤ 알려진 단축·리다이렉트 서비스 — 목록은 이 상수 1곳. 도메인 자신과 그 하위 도메인을 모두 막는다.
 * 클릭 뒤 실제 목적지를 숨기거나 나중에 바꿀 수 있어서 광고 목적지로 쓰지 않는다(광고 「단축 URL 금지」와 같은 기준).
 */
export const EXTERNAL_URL_SHORTENER_HOSTS: readonly string[] = [
  "bit.ly",
  "bitly.com",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "t.ly",
  "rb.gy",
  "tiny.cc",
  "v.gd",
  "s.id",
  "lnkd.in",
  "short.io",
  "bl.ink",
  "han.gl",
  "me2.do",
  "vo.la",
];

const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  // IPv6 리터럴(`[::1]`) · IPv4 리터럴(WHATWG URL 이 0x7f.1 · 2130706433 같은 표기도 점 4칸으로 바꾼다) — 모든 IP 주소 거부
  if (h.startsWith("[") || h.includes(":") || IPV4_HOST.test(h)) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // 점 없는 이름(`https://intranet`)은 공개 도메인이 아니다
  if (!h.includes(".")) return true;
  return false;
}

function isShortenerHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return EXTERNAL_URL_SHORTENER_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

function checkExternalUrl(raw: string): DestinationParseResult {
  if (BLOCKED_SCHEMES.test(raw)) return { ok: false, error: "invalid_url" };
  if (raw.length > EXTERNAL_URL_MAX_LENGTH) return { ok: false, error: "external_url_too_long" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "https_required" };
  if (parsed.username || parsed.password) return { ok: false, error: "external_url_credentials" };
  // `parsed.hostname` 은 이미 소문자 punycode(xn--) — 닮은 글자 도메인도 실제 주소로 비교·저장된다(④)
  if (isPrivateOrLocalHost(parsed.hostname)) return { ok: false, error: "external_url_private_host" };
  if (isShortenerHost(parsed.hostname)) return { ok: false, error: "external_url_shortener" };
  const url = parsed.toString();
  if (url.length > EXTERNAL_URL_MAX_LENGTH) return { ok: false, error: "external_url_too_long" };
  return { ok: true, ref: { kind: "external_url", url } };
}

/**
 * D-4 ④: 입력한 외부 주소의 도메인에 비ASCII 글자가 있었는지 — 어드민 확인 화면이
 * 「실제 주소(punycode)」를 따로 강조해 닮은 주소 속임을 막는다.
 */
export function externalUrlHadNonAsciiHost(raw: unknown): boolean {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = /^https:\/\/([^/?#]*)/i.exec(s);
  if (!m) return false;
  const authority = m[1]!.slice(m[1]!.lastIndexOf("@") + 1);
  return /[^\x00-\x7f]/.test(authority);
}

/**
 * Parse a free-form link (admin input, legacy stored href) into a DestinationRef.
 * "/..." → internal (or event); "https://..." → external. Everything else is rejected.
 */
export function parseDestinationHref(
  raw: unknown,
  opts?: { allowAdmin?: boolean }
): DestinationParseResult {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: false, error: "destination_empty" };
  if (s.startsWith("/")) return checkInternalPath(s, opts);
  return checkExternalUrl(s);
}

/** Validate a structured ref (already typed by the writer). */
export function validateDestinationRef(ref: unknown, opts?: { allowAdmin?: boolean }): DestinationParseResult {
  if (!ref || typeof ref !== "object") return { ok: false, error: "destination_empty" };
  const r = ref as Record<string, unknown>;
  if (r.kind === "event") {
    const id = typeof r.eventId === "string" ? r.eventId.trim() : "";
    return id ? { ok: true, ref: { kind: "event", eventId: id } } : { ok: false, error: "event_id_required" };
  }
  if (r.kind === "internal_route") return checkInternalPath(String(r.path ?? ""), opts);
  if (r.kind === "external_url") return checkExternalUrl(String(r.url ?? "").trim());
  return { ok: false, error: "destination_empty" };
}

/** The href a router / anchor uses for this destination. */
export function destinationHref(ref: DestinationRef): string {
  if (ref.kind === "event") return eventDestinationPath(ref.eventId);
  if (ref.kind === "external_url") return ref.url;
  return ref.path;
}

export function isExternalDestination(ref: DestinationRef): ref is { kind: "external_url"; url: string } {
  return ref.kind === "external_url";
}
