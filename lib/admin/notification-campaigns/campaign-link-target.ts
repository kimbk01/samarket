import { getSiteOrigin } from "@/lib/env/runtime";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

/**
 * ADM-01 — campaign link classification (internal route vs external URL).
 *
 * Absolute URLs on DIBAY's own host are internal routes (host stripped, as before).
 * Absolute URLs on any other host are EXTERNAL: never rewritten into an in-app path, and only
 * usable when https and the host is on the operator allowlist
 * `NOTIFICATION_CAMPAIGN_EXTERNAL_URL_HOSTS` (comma separated). Empty allowlist = fail-closed.
 */
export type CampaignLinkClass =
  | { kind: "empty" }
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string; allowed: boolean }
  | { kind: "invalid" };

function hostSetFromEnv(name: string): Set<string> {
  const raw = process.env[name] ?? "";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hostOf(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function campaignOwnHosts(): Set<string> {
  const hosts = hostSetFromEnv("NOTIFICATION_CAMPAIGN_INTERNAL_HOSTS");
  for (const h of [hostOf(getSiteOrigin()), hostOf(DIBAY_PRODUCTION_SITE_ORIGIN)]) {
    if (h) hosts.add(h);
  }
  return hosts;
}

export function campaignExternalAllowedHosts(): Set<string> {
  return hostSetFromEnv("NOTIFICATION_CAMPAIGN_EXTERNAL_URL_HOSTS");
}

export function classifyCampaignLink(raw: string | null | undefined): CampaignLinkClass {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { kind: "empty" };
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return { kind: "invalid" };
  if (value.startsWith("//")) return { kind: "invalid" };
  if (value.startsWith("/")) return { kind: "internal", path: value };

  let parsed: URL | null = null;
  try {
    parsed = new URL(value);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    // Legacy: bare "market" style paths were stored without a leading slash.
    return /^[a-z0-9][a-z0-9/_\-?=&.%#]*$/i.test(value) ? { kind: "internal", path: `/${value}` } : { kind: "invalid" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { kind: "invalid" };
  const host = parsed.hostname.toLowerCase();
  if (campaignOwnHosts().has(host)) {
    return { kind: "internal", path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  }
  if (parsed.protocol !== "https:") return { kind: "invalid" };
  return { kind: "external", url: parsed.toString(), allowed: campaignExternalAllowedHosts().has(host) };
}

/** Admin save-time check: reject links the app could not open safely. */
export function validateCampaignLinkInput(
  raw: string | null | undefined
): { ok: true } | { ok: false; error: "invalid_campaign_url" | "external_url_not_allowed" } {
  const c = classifyCampaignLink(raw);
  if (c.kind === "invalid") return { ok: false, error: "invalid_campaign_url" };
  if (c.kind === "external" && !c.allowed) return { ok: false, error: "external_url_not_allowed" };
  return { ok: true };
}
