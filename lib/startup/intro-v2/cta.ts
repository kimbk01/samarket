import {
  INTRO_CTA_DESTINATION_TYPES,
  INTRO_EXTERNAL_URL_HOST_ALLOWLIST,
  INTRO_TEXT_ALIGNS,
  isIn,
  type ContractResult,
  type IntroCta,
  type IntroCtaDestination,
  type IntroTextAlign,
} from "@/lib/startup/intro-v2/types";

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;

const CTA_KEYS = new Set([
  "enabled",
  "destination",
  "label",
  "xPct",
  "yPct",
  "widthPct",
  "heightPct",
  "fontSizePct",
  "fontWeight",
  "cornerRadiusPct",
  "opacity",
  "align",
]);

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

function optNumber(raw: unknown, min: number, max: number, key: string): ContractResult<number | undefined> {
  if (raw == null) return { ok: true, value: undefined };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false, error: `${key}_invalid` };
  if (raw < min || raw > max) return { ok: false, error: `${key}_out_of_range` };
  return { ok: true, value: raw };
}

function parseVisual(rec: Record<string, unknown>): ContractResult<Partial<IntroCta>> {
  if (rec.label != null && typeof rec.label !== "string") return { ok: false, error: "cta_label_invalid" };
  const xPct = optNumber(rec.xPct, 0, 100, "xPct");
  if (!xPct.ok) return xPct;
  const yPct = optNumber(rec.yPct, 0, 100, "yPct");
  if (!yPct.ok) return yPct;
  const widthPct = optNumber(rec.widthPct, 0, 100, "widthPct");
  if (!widthPct.ok) return widthPct;
  const heightPct = optNumber(rec.heightPct, 0, 100, "heightPct");
  if (!heightPct.ok) return heightPct;
  const fontSizePct = optNumber(rec.fontSizePct, 0.5, 20, "fontSizePct");
  if (!fontSizePct.ok) return fontSizePct;
  const fontWeight = optNumber(rec.fontWeight, 100, 900, "fontWeight");
  if (!fontWeight.ok) return fontWeight;
  const cornerRadiusPct = optNumber(rec.cornerRadiusPct, 0, 50, "cornerRadiusPct");
  if (!cornerRadiusPct.ok) return cornerRadiusPct;
  const opacity = optNumber(rec.opacity, 0, 1, "opacity");
  if (!opacity.ok) return opacity;
  if (rec.align != null && !isIn(INTRO_TEXT_ALIGNS, rec.align)) return { ok: false, error: "cta_align_invalid" };
  return {
    ok: true,
    value: {
      label: typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : undefined,
      xPct: xPct.value,
      yPct: yPct.value,
      widthPct: widthPct.value,
      heightPct: heightPct.value,
      fontSizePct: fontSizePct.value,
      fontWeight: fontWeight.value,
      cornerRadiusPct: cornerRadiusPct.value,
      opacity: opacity.value,
      align: isIn(INTRO_TEXT_ALIGNS, rec.align) ? (rec.align as IntroTextAlign) : undefined,
    },
  };
}

function parseDestination(dest: Record<string, unknown>): ContractResult<IntroCtaDestination> {
  if (!isIn(INTRO_CTA_DESTINATION_TYPES, dest.type)) return { ok: false, error: "cta_destination_type_invalid" };
  const label = typeof dest.label === "string" && dest.label.trim() ? dest.label.trim() : undefined;

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
    return { ok: true, value: { type: "EXTERNAL_URL", url: parsed.toString(), label } };
  }

  if (dest.type === "INTERNAL_PATH") {
    const path = validateInternalPath(String(dest.path ?? "").trim());
    if (!path.ok) return path;
    return { ok: true, value: { type: "INTERNAL_PATH", path: path.value, label } };
  }

  if (
    dest.type === "COMMUNITY" ||
    dest.type === "TRADE" ||
    dest.type === "DELIVERY" ||
    dest.type === "MESSENGER" ||
    dest.type === "MY_PAGE"
  ) {
    return { ok: true, value: { type: dest.type, label } };
  }

  const id = String(dest.id ?? "").trim();
  if (!id) return { ok: false, error: "cta_destination_id_required" };
  return { ok: true, value: { type: dest.type, id, label } };
}

export function validateIntroCta(raw: unknown): ContractResult<IntroCta | null> {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "cta_not_object" };
  const rec = raw as Record<string, unknown>;
  const extra = Object.keys(rec).filter((k) => !CTA_KEYS.has(k));
  if (extra.length) return { ok: false, error: "cta_unknown_key" };
  if (typeof rec.enabled !== "boolean") return { ok: false, error: "cta_enabled_required" };

  const visual = parseVisual(rec);
  if (!visual.ok) return visual;

  if (!rec.enabled) {
    let destination: IntroCtaDestination = { type: "COMMUNITY" };
    if (rec.destination && typeof rec.destination === "object" && !Array.isArray(rec.destination)) {
      const dest = parseDestination(rec.destination as Record<string, unknown>);
      if (dest.ok) destination = dest.value;
    }
    return { ok: true, value: { enabled: false, destination, ...visual.value } };
  }

  const destRaw = rec.destination;
  if (destRaw == null || typeof destRaw !== "object" || Array.isArray(destRaw)) {
    return { ok: false, error: "cta_destination_required" };
  }
  const dest = parseDestination(destRaw as Record<string, unknown>);
  if (!dest.ok) return dest;
  return { ok: true, value: { enabled: true, destination: dest.value, ...visual.value } };
}
