import { resolve4, resolve6 } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "instance-data",
  "local",
  "metadata",
]);

/**
 * SSRF gate for community crawler fetch (initial URL and every redirect target).
 */
export async function assertPublicHttpUrlForCrawlFetch(urlString: string): Promise<URL> {
  const trimmed = (urlString ?? "").trim();
  if (!trimmed) throw new Error("empty");
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }
  if (u.username || u.password) {
    throw new Error("credentials");
  }
  if (u.port) {
    const port = Number(u.port);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) throw new Error("bad_port");
  }
  const host = u.hostname.toLowerCase();
  if (!host) throw new Error("no_host");
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("bad_host");
  }
  for (const h of BLOCKED_HOSTNAMES) {
    if (host === h) throw new Error("bad_host");
  }
  if (isIpLiteral(host)) {
    if (isPrivateOrReservedIp(host)) throw new Error("private");
    return u;
  }
  await assertDnsResolvesToPublicIpsOnly(host);
  return u;
}

function isIpLiteral(host: string): boolean {
  return net.isIP(host) !== 0;
}

export function isPrivateOrReservedIp(host: string): boolean {
  if (net.isIP(host) === 4) {
    const p = host.split(".").map((x) => parseInt(x, 10)) as [number, number, number, number];
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) return true;
    return false;
  }
  if (net.isIP(host) === 6) {
    const h = host.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("::ffff:")) {
      const v4 = h.slice("::ffff:".length);
      if (net.isIP(v4) === 4) return isPrivateOrReservedIp(v4);
    }
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("fe80:")) return true;
    if (h.startsWith("ff")) return true;
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

export function resolveCrawlUrl(base: string, href: string): string | null {
  const h = (href ?? "").trim();
  if (!h || /^javascript:/i.test(h) || /^data:/i.test(h) || /^mailto:/i.test(h)) return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}
