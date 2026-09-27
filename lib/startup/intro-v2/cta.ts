import {
  INTRO_CTA_DESTINATION_TYPES,
  INTRO_EXTERNAL_URL_HOST_ALLOWLIST,
  isIn,
  type ContractResult,
  type IntroCta,
} from "@/lib/startup/intro-v2/types";

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;

export function isAllowedIntroExternalHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  return (INTRO_EXTERNAL_URL_HOST_ALLOWLIST as readonly string[]).includes(normalized);
}

function validateInternalPath(path: string): ContractResult<string> {
  if (!path.startsWith("/") || path.startsWith("//")) return { ok: false, error: "internal_path_required" };
  if (BLOCKED_SCHEMES.test(path)) return { ok: false, error: "invalid_url_scheme" };
  const lower = path.toLowerCase();
  if (lower.startsWith("/admin") || lower.startsWith("/stores/owner")) {
    return { ok: false, error: "internal_path_forbidden" };
  }
  return { ok: true, value: path };
}

export function validateIntroCta(raw: unknown): ContractResult<IntroCta | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "cta_not_object" };
  const rec = raw as Record<string, unknown>;
  const extra = Object.keys(rec).filter((k) => !["enabled", "destination"].includes(k));
  if (extra.length) return { ok: false, error: "cta_unknown_key" };
  if (typeof rec.enabled !== "boolean") return { ok: false, error: "cta_enabled_required" };
  if (!rec.enabled) {
    return { ok: true, value: { enabled: false, destination: { type: "COMMUNITY" } } };
  }
  const destRaw = rec.destination;
  if (destRaw == null || typeof destRaw !== "object" || Array.isArray(destRaw)) {
    return { ok: false, error: "cta_destination_required" };
  }
  const dest = destRaw as Record<string, unknown>;
  if (!isIn(INTRO_CTA_DESTINATION_TYPES, dest.type)) return { ok: false, error: "cta_destination_type_invalid" };

  if (dest.type === "EXTERNAL_URL") {
    const url = String(dest.url ?? "").trim();
    if (!url) return { ok: false, error: "external_url_required" };
    if (BLOCKED_SCHEMES.test(url)) return { ok: false, error: "invalid_url_scheme" };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "invalid_url" };
    }
    if (parsed.protocol !== "https:") return { ok: false, error: "https_required" };
    if (!isAllowedIntroExternalHost(parsed.hostname)) return { ok: false, error: "external_host_not_allowed" };
    return {
      ok: true,
      value: { enabled: true, destination: { type: "EXTERNAL_URL", url: parsed.toString() } },
    };
  }

  if (dest.type === "INTERNAL_PATH") {
    const path = validateInternalPath(String(dest.path ?? "").trim());
    if (!path.ok) return path;
    return { ok: true, value: { enabled: true, destination: { type: "INTERNAL_PATH", path: path.value } } };
  }

  if (dest.type === "COMMUNITY" || dest.type === "TRADE" || dest.type === "DELIVERY" || dest.type === "MESSENGER" || dest.type === "MY_PAGE") {
    return { ok: true, value: { enabled: true, destination: { type: dest.type } } };
  }

  const id = String(dest.id ?? "").trim();
  if (!id) return { ok: false, error: "cta_destination_id_required" };
  return { ok: true, value: { enabled: true, destination: { type: dest.type, id } } };
}
