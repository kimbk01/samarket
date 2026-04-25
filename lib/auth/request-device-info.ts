import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/http/api-route";

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBrowserFamily(userAgent: string, secChUa: string): string {
  const hint = secChUa.toLowerCase();
  const ua = userAgent.toLowerCase();
  if (hint.includes("edge") || ua.includes("edg/")) return "edge";
  if (hint.includes("whale") || ua.includes("whale/")) return "whale";
  if (hint.includes("firefox") || ua.includes("firefox/")) return "firefox";
  if (hint.includes("safari") || (ua.includes("safari/") && !ua.includes("chrome/"))) return "safari";
  if (hint.includes("opera") || ua.includes("opr/")) return "opera";
  if (hint.includes("chrome") || ua.includes("chrome/") || ua.includes("crios/")) return "chrome";
  return "";
}

function normalizeDeviceSource(userAgent: string): string {
  return userAgent
    .replace(/\b(Edg|Edge|Whale|OPR|Opera|Chrome|CriOS|Firefox|FxiOS|Safari|Version|SamsungBrowser|YaBrowser|UCBrowser)\/[^\s)]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fingerprint(value: string): string | null {
  const normalized = compactWhitespace(value).toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function buildRequestDeviceInfo(request: NextRequest | { headers: Headers }): string {
  const userAgent = compactWhitespace(request.headers.get("user-agent") ?? "");
  const platform = compactWhitespace(request.headers.get("sec-ch-ua-platform") ?? "");
  const mobile = compactWhitespace(request.headers.get("sec-ch-ua-mobile") ?? "");
  const language = compactWhitespace(request.headers.get("accept-language")?.split(",")[0] ?? "");
  const pieces = [userAgent, platform ? `platform:${platform}` : "", mobile ? `mobile:${mobile}` : "", language ? `lang:${language}` : ""]
    .filter(Boolean)
    .join(" | ");
  return pieces.slice(0, 500);
}

export type RequestSessionMeta = {
  deviceInfo: string;
  deviceKey: string | null;
  browserKey: string | null;
  ipAddress: string | null;
};

export function buildRequestSessionMeta(request: NextRequest): RequestSessionMeta {
  const userAgent = compactWhitespace(request.headers.get("user-agent") ?? "");
  const platform = compactWhitespace(request.headers.get("sec-ch-ua-platform") ?? "");
  const mobile = compactWhitespace(request.headers.get("sec-ch-ua-mobile") ?? "");
  const language = compactWhitespace(request.headers.get("accept-language")?.split(",")[0] ?? "");
  const secChUa = compactWhitespace(request.headers.get("sec-ch-ua") ?? "");
  const browserKey = normalizeBrowserFamily(userAgent, secChUa) || null;
  const deviceSource = [normalizeDeviceSource(userAgent), platform, mobile, language].filter(Boolean).join(" | ");
  return {
    deviceInfo: buildRequestDeviceInfo(request),
    deviceKey: fingerprint(deviceSource),
    browserKey,
    ipAddress: compactWhitespace(getClientIp(request)) || null,
  };
}
