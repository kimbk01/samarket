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
function isPrivateOrReservedIp(host: string): boolean {
  if (net.isIP(host) === 4) {
    const p = host.split(".").map((x) => parseInt(x, 10)) as [number, number, number, number];
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) return true; // local CGN
    return false;
  }
  if (net.isIP(host) === 6) {
    const h = host.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("::ffff:") && h.includes("127.")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
    if (h.startsWith("fe80:")) return true; // link-local
    if (h.startsWith("ff")) return true; // multicast
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
