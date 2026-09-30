export const STARTUP_PRESENTATION_SCHEMA_VERSION = 1 as const;
export const STARTUP_PRESENTATION_BRAND_GREEN = "#0B421A" as const;
export const STARTUP_PRESENTATION_DEFAULT_LOGO_LABEL = "dibaY" as const;

export type StartupPresentationFitR15 = "contain";

export type StartupPresentationLogoR15 = {
  assetId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: StartupPresentationFitR15;
};

export type StartupPresentationSystemStartR15 = {
  backgroundColor: string;
  logo: StartupPresentationLogoR15;
  minimumVisibleMs: number;
};

export type StartupPresentationDocumentR15 = {
  schemaVersion: typeof STARTUP_PRESENTATION_SCHEMA_VERSION;
  systemStart: StartupPresentationSystemStartR15;
};

export type StartupPresentationAssetManifestItemR15 = {
  assetId: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
};

export type GenerationManifestR15 = {
  schemaVersion: typeof STARTUP_PRESENTATION_SCHEMA_VERSION;
  generationId: string;
  documentHash: string;
  document: StartupPresentationDocumentR15;
  assetManifest: StartupPresentationAssetManifestItemR15[];
  createdAt: string;
  publishedAt: string;
  integrity: {
    algorithm: "sha256";
    manifestHash: string;
  };
};

export type StartupPresentationValidationResult =
  | { ok: true; document: StartupPresentationDocumentR15 }
  | { ok: false; error: string };

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

function normalizeMinimumVisibleMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 900;
  return Math.min(5000, Math.max(250, Math.trunc(value)));
}

export function createBootstrapStartupPresentationDocument(): StartupPresentationDocumentR15 {
  return {
    schemaVersion: STARTUP_PRESENTATION_SCHEMA_VERSION,
    systemStart: {
      backgroundColor: STARTUP_PRESENTATION_BRAND_GREEN,
      logo: {
        assetId: null,
        x: 0.5,
        y: 0.5,
        width: 0.42,
        height: 0.18,
        fit: "contain",
      },
      minimumVisibleMs: 900,
    },
  };
}

export function normalizeStartupPresentationDocument(
  raw: unknown
): StartupPresentationDocumentR15 {
  const base = createBootstrapStartupPresentationDocument();
  if (raw == null || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const systemStartRaw =
    o.systemStart != null && typeof o.systemStart === "object"
      ? (o.systemStart as Record<string, unknown>)
      : {};
  const logoRaw =
    systemStartRaw.logo != null && typeof systemStartRaw.logo === "object"
      ? (systemStartRaw.logo as Record<string, unknown>)
      : {};

  return {
    schemaVersion: STARTUP_PRESENTATION_SCHEMA_VERSION,
    systemStart: {
      backgroundColor: normalizeHexColor(
        systemStartRaw.backgroundColor,
        base.systemStart.backgroundColor
      ),
      logo: {
        assetId:
          typeof logoRaw.assetId === "string" && logoRaw.assetId.trim()
            ? logoRaw.assetId.trim()
            : null,
        x: clamp01(logoRaw.x, base.systemStart.logo.x),
        y: clamp01(logoRaw.y, base.systemStart.logo.y),
        width: clamp01(logoRaw.width, base.systemStart.logo.width),
        height: clamp01(logoRaw.height, base.systemStart.logo.height),
        fit: "contain",
      },
      minimumVisibleMs: normalizeMinimumVisibleMs(systemStartRaw.minimumVisibleMs),
    },
  };
}

export function validateStartupPresentationDocument(
  raw: unknown
): StartupPresentationValidationResult {
  const document = normalizeStartupPresentationDocument(raw);
  const { logo } = document.systemStart;
  if (logo.width <= 0 || logo.height <= 0) {
    return { ok: false, error: "invalid_logo_geometry" };
  }
  return { ok: true, document };
}

export function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}
