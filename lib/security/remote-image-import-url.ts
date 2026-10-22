import { resolve4, resolve6 } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "instance-data",
  "local",
]);

/**
 * URL 문자열·호스트·DNS 해상 공개 IP만 허용(원격 이미지 import 시 SSRF 완화).
 * 서버 `fetch` 직전에 호출합니다.
 */
export async function assertPublicHttpUrlForImageFetch(urlString: string): Promise<URL> {
  const trimmed = (urlString ?? "").trim();
  if (!trimmed) throw new Error("empty");
  const u = new URL(trimmed);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }
  const host = u.hostname.toLowerCase();
  if (!host) throw new Error("no_host");
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("bad_host");
  }
  for (const h of BLOCKED_HOSTNAMES) {
    if (host === h) throw new Error("bad_host");
  }
  if (isUnsafeIpString(host)) {
    if (isPrivateOrReservedIp(host)) throw new Error("private");
    return u;
  }
  await assertDnsResolvesToPublicIpsOnly(host);
  return u;
}

function isUnsafeIpString(host: string): boolean {
  return net.isIP(host) !== 0;
}

/**
 * @param host `net.isIP(host) > 0` 를 만족하는 문자열(IPv4 또는 IPv6)
 */
function isPrivateOrReservedIpv4(p: [number, number, number, number]): boolean {
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true; // link-local · 클라우드 메타데이터
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // IETF protocol assignments
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // local CGN
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmarking
  if (p[0] >= 224) return true; // multicast · reserved · broadcast
  return false;
}

/** IPv6 문자열 → 16바이트(압축 표기·IPv4 꼬리 포함). 실패 시 null */
function ipv6ToBytes(host: string): number[] | null {
  let h = host.toLowerCase();
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  let tail: number[] = [];
  const lastColon = h.lastIndexOf(":");
  const maybeV4 = h.slice(lastColon + 1);
  if (net.isIP(maybeV4) === 4) {
    tail = maybeV4.split(".").map((x) => parseInt(x, 10));
    h = `${h.slice(0, lastColon + 1)}0:0`;
  }
  const [head, rest] = h.split("::");
  const headParts = head ? head.split(":") : [];
  const restParts = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const fill = rest !== undefined ? 8 - headParts.length - restParts.length : 0;
  const parts = [...headParts, ...Array(Math.max(0, fill)).fill("0"), ...restParts];
  if (parts.length !== 8) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    const n = parseInt(part || "0", 16);
    if (Number.isNaN(n)) return null;
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes;
}

/**
 * @param host `net.isIP(host) > 0` 를 만족하는 문자열(IPv4 또는 IPv6)
 */
export function isPrivateOrReservedIp(host: string): boolean {
  if (net.isIP(host) === 4) {
    return isPrivateOrReservedIpv4(host.split(".").map((x) => parseInt(x, 10)) as [number, number, number, number]);
  }
  if (net.isIP(host) === 6) {
    const b = ipv6ToBytes(host);
    if (!b) return true;
    if (b.every((x) => x === 0)) return true; // ::
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
    const v4 = b.slice(12, 16) as [number, number, number, number];
    // IPv4-mapped (::ffff:a.b.c.d) · IPv4-compatible (::a.b.c.d) · NAT64 (64:ff9b::/96) → 안쪽 IPv4 로 판정
    const isMapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
    const isCompat = b.slice(0, 12).every((x) => x === 0);
    const isNat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0);
    if (isMapped || isCompat || isNat64) return isPrivateOrReservedIpv4(v4);
    if ((b[0]! & 0xfe) === 0xfc) return true; // ULA fc00::/7
    if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // link-local fe80::/10
    if (b[0] === 0xff) return true; // multicast
    return false;
  }
  return true;
}

async function assertDnsResolvesToPublicIpsOnly(hostname: string): Promise<void> {
  const v4: string[] = [];
  const v6: string[] = [];
  try {
    v4.push(...(await resolve4(hostname)));
  } catch {
    /* */
  }
  try {
    v6.push(...(await resolve6(hostname)));
  } catch {
    /* */
  }
  const all = [...v4, ...v6];
  if (all.length === 0) throw new Error("unresolved");
  for (const a of all) {
    if (isPrivateOrReservedIp(a)) throw new Error("private");
  }
}

export type SafeRemoteFetchResult =
  | { ok: true; res: Response; body: Buffer; finalUrl: string }
  | { ok: false; reason: "blocked" | "network" | "too_large" | "too_many_redirects" | "http"; status?: number };

/**
 * 공개 주소만 따라가는 원격 GET — 리다이렉트를 홉마다 다시 검사하고(최대 3회),
 * 응답 본문은 스트림으로 읽으며 상한을 넘으면 즉시 중단한다 (CM-P2-15).
 */
export async function fetchPublicUrlWithChecks(
  urlString: string,
  opts: { headers: Record<string, string>; maxBytes: number; timeoutMs: number; maxRedirects?: number }
): Promise<SafeRemoteFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let current = urlString;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let target: URL;
    try {
      target = await assertPublicHttpUrlForImageFetch(current);
    } catch {
      return { ok: false, reason: "blocked" };
    }
    let res: Response;
    try {
      res = await fetch(target.href, { method: "GET", redirect: "manual", cache: "no-store", signal, headers: opts.headers });
    } catch {
      return { ok: false, reason: "network" };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      void res.body?.cancel().catch(() => {});
      if (!loc) return { ok: false, reason: "http", status: res.status };
      current = new URL(loc, target.href).href;
      continue;
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, reason: "http", status: res.status };
    }
    const declared = parseInt(res.headers.get("content-length") ?? "", 10);
    if (!Number.isNaN(declared) && declared > opts.maxBytes) {
      void res.body?.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > opts.maxBytes) {
            void reader.cancel().catch(() => {});
            return { ok: false, reason: "too_large" };
          }
          chunks.push(value);
        }
      } catch {
        return { ok: false, reason: "network" };
      }
    }
    return { ok: true, res, body: Buffer.concat(chunks), finalUrl: target.href };
  }
  return { ok: false, reason: "too_many_redirects" };
}
