/**
 * R17-OS — OS start screen (TRUE Android SplashScreen / iOS LaunchScreen) admin contract.
 *
 * BUILD-TIME ONLY. Admin edits a PENDING value; it reaches devices only through
 * `npm run os-launch:pull` → native build → store release. Apps never fetch this at runtime.
 *
 * Common platform capability (Android 12+ SplashScreen ∩ iOS LaunchScreen):
 *   - background color
 *   - one centered static logo (transparent PNG)
 * Not supported (never exposed): text, free position, free size, display duration, live apply.
 *
 * Pure module — no app/server imports (also used by tests and the generator contract).
 */

export const OS_LAUNCH_TABLE = "os_launch_config";
export const OS_LAUNCH_ROW_ID = "default";
export const OS_LAUNCH_STORAGE_BUCKET = "os-launch-assets";
export const OS_LAUNCH_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const OS_LAUNCH_LOGO_MIN_EDGE_PX = 512;
export const OS_LAUNCH_LOGO_MAX_EDGE_PX = 4096;

/** Android splash icon: logo width as a share of the icon canvas (fits the 2/3 safe circle). */
export const OS_LAUNCH_ANDROID_LOGO_WIDTH_RATIO = 0.44;
/** iOS LaunchScreen logo width in points. */
export const OS_LAUNCH_IOS_LOGO_WIDTH_PT = 106;

export type OsLaunchLogoRef = {
  /** Repo-relative source path (build config) or storage object path (pending). */
  source: string;
  width: number;
  height: number;
  sha256: string;
};

export type OsLaunchBuildConfig = {
  version: number;
  backgroundColor: string;
  logo: OsLaunchLogoRef;
  appliedFromAdmin: { updatedAt: string; sha256: string | null } | null;
};

export type OsLaunchPending = {
  backgroundColor: string;
  /** null = keep the logo of the current build. */
  logo: OsLaunchLogoRef | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

const HEX6 = /^#[0-9A-F]{6}$/;

/** "#0b5" / "0B5A24" / "#0b5a24" → "#0B5A24"; anything else → null. */
export function normalizeOsLaunchHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().toUpperCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9A-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return HEX6.test(s) ? s : null;
}

export type PngInfo = { width: number; height: number; hasAlpha: boolean };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the PNG signature + IHDR. Returns null when the bytes are not a PNG. */
export function readPngInfo(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 33) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== "IHDR") return null;
  const u32 = (o: number) =>
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const width = u32(16);
  const height = u32(20);
  const colorType = bytes[25];
  // 4 = grayscale+alpha, 6 = RGBA; 3 = palette (alpha only via tRNS chunk).
  let hasAlpha = colorType === 4 || colorType === 6;
  if (!hasAlpha && colorType === 3) {
    hasAlpha = indexOfChunk(bytes, "tRNS") >= 0;
  }
  return { width, height, hasAlpha };
}

function indexOfChunk(bytes: Uint8Array, name: string): number {
  let o = 8;
  while (o + 8 <= bytes.length) {
    const len =
      ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
    const t = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    if (t === name) return o;
    if (t === "IDAT" || t === "IEND") return -1;
    o += 12 + len;
  }
  return -1;
}

export type OsLaunchLogoCheck =
  | { ok: true; info: PngInfo }
  | {
      ok: false;
      error: "not_png" | "too_large" | "empty" | "no_alpha" | "too_small" | "too_big_dimensions";
    };

/** Admin upload rule: transparent PNG, ≥512 px on the short edge, ≤4096 px, ≤5 MB. */
export function checkOsLaunchLogo(bytes: Uint8Array): OsLaunchLogoCheck {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > OS_LAUNCH_LOGO_MAX_BYTES) return { ok: false, error: "too_large" };
  const info = readPngInfo(bytes);
  if (!info) return { ok: false, error: "not_png" };
  if (!info.hasAlpha) return { ok: false, error: "no_alpha" };
  if (Math.min(info.width, info.height) < OS_LAUNCH_LOGO_MIN_EDGE_PX) {
    return { ok: false, error: "too_small" };
  }
  if (Math.max(info.width, info.height) > OS_LAUNCH_LOGO_MAX_EDGE_PX) {
    return { ok: false, error: "too_big_dimensions" };
  }
  return { ok: true, info };
}

/** Pending differs from what the current native build carries. */
export function isOsLaunchPendingChanged(
  build: Pick<OsLaunchBuildConfig, "backgroundColor" | "logo">,
  pending: Pick<OsLaunchPending, "backgroundColor" | "logo"> | null
): boolean {
  if (!pending) return false;
  if (normalizeOsLaunchHex(pending.backgroundColor) !== normalizeOsLaunchHex(build.backgroundColor)) {
    return true;
  }
  return pending.logo !== null && pending.logo.sha256 !== build.logo.sha256;
}

/** Repo build-config logo source → public URL for admin preview (sources live under public/). */
export function osLaunchBuildLogoPublicUrl(source: string): string | null {
  const s = source.replace(/\\/g, "/");
  return s.startsWith("public/") ? `/${s.slice("public/".length)}` : null;
}
