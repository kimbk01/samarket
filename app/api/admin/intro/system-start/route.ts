import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  getReadyRuntimeForMedia,
  listReadyIntroMedia,
} from "@/lib/intro/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_PATH = path.join(process.cwd(), "config/system-start.build.json");
const LOGO_ASSET_DIR = path.join(process.cwd(), "native/system-start/assets");

/** Owner-configurable SYSTEM_START_MIN_VISIBLE_MS. 0 = no configured min. */
export const SYSTEM_START_MIN_VISIBLE_PRESETS_MS = [0, 300, 500, 800, 1000] as const;

type LogoFit = "CONTAIN" | "COVER" | "ORIGINAL";

type SystemStartBuild = {
  version: number;
  backgroundColor: string;
  matchScene1Appearance: boolean;
  brandMarkEnabled: boolean;
  logoMediaId: string | null;
  logoFit: LogoFit;
  logoSizeNorm: number;
  logoXNorm: number;
  logoYNorm: number;
  /** SYSTEM_START_MIN_VISIBLE_MS — Owner-configurable; not a hidden timer. */
  minVisibleMs: number;
  note?: string;
};

function clamp01(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(0.95, Math.max(0.05, n));
}

function normalizeMinVisibleMs(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (
    (SYSTEM_START_MIN_VISIBLE_PRESETS_MS as readonly number[]).includes(rounded)
  ) {
    return rounded;
  }
  // Snap to nearest allowed preset (never invent false sub-minima).
  let best: number = SYSTEM_START_MIN_VISIBLE_PRESETS_MS[0];
  let bestDist = Math.abs(rounded - best);
  for (const p of SYSTEM_START_MIN_VISIBLE_PRESETS_MS) {
    const d = Math.abs(rounded - p);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function readBuild(): SystemStartBuild {
  const raw = JSON.parse(fs.readFileSync(BUILD_PATH, "utf8")) as Partial<SystemStartBuild>;
  const fit = raw.logoFit;
  const logoMediaId =
    typeof raw.logoMediaId === "string" && raw.logoMediaId.trim()
      ? raw.logoMediaId.trim()
      : null;
  return {
    version: Number(raw.version) || 1,
    backgroundColor: String(raw.backgroundColor || "#312E81").toUpperCase(),
    matchScene1Appearance: !!raw.matchScene1Appearance,
    brandMarkEnabled: !!raw.brandMarkEnabled,
    logoMediaId,
    logoFit:
      fit === "COVER" || fit === "ORIGINAL" || fit === "CONTAIN" ? fit : "CONTAIN",
    logoSizeNorm: clamp01(Number(raw.logoSizeNorm), 0.28),
    logoXNorm: clamp01(Number(raw.logoXNorm), 0.5),
    logoYNorm: clamp01(Number(raw.logoYNorm), 0.42),
    minVisibleMs: normalizeMinVisibleMs(raw.minVisibleMs, 0),
    note:
      raw.note ||
      "Build-bound OS System Start. Changing this requires a native app build/update. Not Live CMS / Service Apply.",
  };
}

function normalizeHex(input: string): string | null {
  const h = String(input || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return `#${h}`;
}

async function resolveLogoPreview(
  logoMediaId: string | null,
): Promise<string | null> {
  if (!logoMediaId) return null;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) return null;
  const items = await listReadyIntroMedia(sb);
  return items.find((m) => m.mediaId === logoMediaId)?.previewUrl ?? null;
}

async function materializeLogoAsset(logoMediaId: string | null): Promise<{
  assetRelPath: string | null;
  cleared: boolean;
}> {
  if (!logoMediaId) {
    if (fs.existsSync(LOGO_ASSET_DIR)) {
      for (const name of fs.readdirSync(LOGO_ASSET_DIR)) {
        if (name.startsWith("logo.")) {
          fs.unlinkSync(path.join(LOGO_ASSET_DIR, name));
        }
      }
    }
    return { assetRelPath: null, cleared: true };
  }
  const sb = resolveServiceSupabaseForApi();
  if (!sb) throw new Error("supabase_unconfigured");
  const runtime = await getReadyRuntimeForMedia(sb, logoMediaId);
  if (!runtime) throw new Error("logo_media_not_ready");
  fs.mkdirSync(LOGO_ASSET_DIR, { recursive: true });
  for (const name of fs.readdirSync(LOGO_ASSET_DIR)) {
    if (name.startsWith("logo.")) {
      fs.unlinkSync(path.join(LOGO_ASSET_DIR, name));
    }
  }
  const fileName = `logo.${runtime.ext}`;
  const abs = path.join(LOGO_ASSET_DIR, fileName);
  fs.writeFileSync(abs, runtime.bytes);
  return { assetRelPath: `native/system-start/assets/${fileName}`, cleared: false };
}

function runGenerate(): { ok: true } | { ok: false; detail: string } {
  const gen = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts/generate-system-start-build-input.mjs")],
    { encoding: "utf8" },
  );
  if (gen.status !== 0) {
    return {
      ok: false,
      detail: (gen.stderr || gen.stdout || "").slice(0, 500),
    };
  }
  return { ok: true };
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const build = readBuild();
    const logoPreviewUrl = await resolveLogoPreview(build.logoMediaId);
    return NextResponse.json({
      ok: true as const,
      systemStart: {
        ...build,
        logoPreviewUrl,
      },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      buildBound: true,
      appliesVia: "native_app_build_update",
      notLiveCms: true,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "system_start_read_failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as {
      backgroundColor?: string;
      matchScene1Appearance?: boolean;
      brandMarkEnabled?: boolean;
      logoMediaId?: string | null;
      clearLogo?: boolean;
      scene1BackgroundColor?: string | null;
      logoFit?: LogoFit;
      logoSizeNorm?: number;
      logoXNorm?: number;
      logoYNorm?: number;
      minVisibleMs?: number;
    };
    const current = readBuild();
    const nextColor = normalizeHex(body.backgroundColor ?? current.backgroundColor);
    if (!nextColor) {
      return NextResponse.json({ ok: false, error: "invalid_background_color" }, { status: 400 });
    }
    const matchScene1 =
      body.matchScene1Appearance !== undefined
        ? !!body.matchScene1Appearance
        : current.matchScene1Appearance;
    let backgroundColor = nextColor;
    if (matchScene1 && body.scene1BackgroundColor) {
      const scene1 = normalizeHex(body.scene1BackgroundColor);
      if (scene1) backgroundColor = scene1;
    }
    const fit = body.logoFit;

    let logoMediaId = current.logoMediaId;
    if (body.clearLogo === true || body.logoMediaId === null) {
      logoMediaId = null;
    } else if (typeof body.logoMediaId === "string" && body.logoMediaId.trim()) {
      logoMediaId = body.logoMediaId.trim();
    }

    const brandMarkEnabled =
      body.brandMarkEnabled !== undefined
        ? !!body.brandMarkEnabled
        : logoMediaId
          ? true
          : current.brandMarkEnabled;

    // ON without media is invalid — force OFF until media selected.
    const effectiveBrand = brandMarkEnabled && !!logoMediaId;

    await materializeLogoAsset(effectiveBrand ? logoMediaId : null);

    const next: SystemStartBuild = {
      version: current.version,
      backgroundColor,
      matchScene1Appearance: matchScene1,
      brandMarkEnabled: effectiveBrand,
      logoMediaId: effectiveBrand ? logoMediaId : null,
      logoFit:
        fit === "COVER" || fit === "ORIGINAL" || fit === "CONTAIN"
          ? fit
          : current.logoFit,
      logoSizeNorm:
        body.logoSizeNorm !== undefined
          ? clamp01(Number(body.logoSizeNorm), current.logoSizeNorm)
          : current.logoSizeNorm,
      logoXNorm:
        body.logoXNorm !== undefined
          ? clamp01(Number(body.logoXNorm), current.logoXNorm)
          : current.logoXNorm,
      logoYNorm:
        body.logoYNorm !== undefined
          ? clamp01(Number(body.logoYNorm), current.logoYNorm)
          : current.logoYNorm,
      minVisibleMs: normalizeMinVisibleMs(
        body.minVisibleMs !== undefined ? body.minVisibleMs : current.minVisibleMs,
        current.minVisibleMs,
      ),
      note: current.note,
    };
    fs.writeFileSync(BUILD_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    const gen = runGenerate();
    if (!gen.ok) {
      return NextResponse.json(
        { ok: false, error: "generate_failed", detail: gen.detail },
        { status: 500 },
      );
    }
    const logoPreviewUrl = await resolveLogoPreview(next.logoMediaId);
    return NextResponse.json({
      ok: true as const,
      systemStart: { ...next, logoPreviewUrl },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      buildBound: true,
      requiresNativeRebuild: true,
      message:
        "다음 앱 버전 설정이 저장되었습니다. 앱 업데이트가 필요합니다. 서비스 적용으로 설치 앱이 바뀌지 않습니다.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "system_start_write_failed" },
      { status: 500 },
    );
  }
}
