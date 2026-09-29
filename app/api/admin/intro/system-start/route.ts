import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  BRAND_SIZE_NORM,
  BRAND_SIZE_PRESETS,
  SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
  type BrandSizePreset,
} from "@/lib/intro/system-start/contract";
import {
  getSystemStartConfig,
  putSystemStartConfig,
} from "@/lib/intro/system-start/service";
import { getReadyRuntimeForMedia } from "@/lib/intro/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_PATH = path.join(process.cwd(), "config/system-start.build.json");
const LOGO_ASSET_DIR = path.join(process.cwd(), "native/system-start/assets");

/**
 * DERIVED only — never durable authority.
 * Best-effort on local/CI; Production Save must succeed even if FS is ephemeral.
 */
async function syncDerivedBuildInput(opts: {
  revision: number;
  backgroundColor: string;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
  sb: NonNullable<ReturnType<typeof resolveServiceSupabaseForApi>>;
}): Promise<{ derivedOk: boolean; detail?: string; logoIntegrity?: string | null }> {
  try {
    let logoIntegrity: string | null = null;
    if (opts.brandAssetEnabled && opts.brandAssetMediaId) {
      const runtime = await getReadyRuntimeForMedia(opts.sb, opts.brandAssetMediaId);
      if (!runtime) return { derivedOk: false, detail: "brand_media_not_ready" };
      // F2: identity = runtime integrity bytes, not mediaId alone.
      logoIntegrity = runtime.integrity;
      fs.mkdirSync(LOGO_ASSET_DIR, { recursive: true });
      for (const name of fs.readdirSync(LOGO_ASSET_DIR)) {
        if (name.startsWith("logo.")) {
          fs.unlinkSync(path.join(LOGO_ASSET_DIR, name));
        }
      }
      const fileName = `logo.${runtime.ext}`;
      fs.writeFileSync(path.join(LOGO_ASSET_DIR, fileName), runtime.bytes);
      fs.writeFileSync(
        path.join(LOGO_ASSET_DIR, "logo.integrity"),
        `${logoIntegrity}\n`,
        "utf8",
      );
    } else if (fs.existsSync(LOGO_ASSET_DIR)) {
      for (const name of fs.readdirSync(LOGO_ASSET_DIR)) {
        if (name.startsWith("logo.")) {
          fs.unlinkSync(path.join(LOGO_ASSET_DIR, name));
        }
      }
    }

    const derived = {
      version: opts.revision,
      backgroundColor: opts.backgroundColor,
      matchScene1Appearance: false,
      brandMarkEnabled: opts.brandAssetEnabled,
      logoMediaId: opts.brandAssetMediaId,
      logoIntegrity,
      brandSizePreset: opts.brandSizePreset,
      logoFit: "CONTAIN" as const,
      logoSizeNorm: BRAND_SIZE_NORM[opts.brandSizePreset],
      logoXNorm: 0.5,
      logoYNorm: 0.5,
      minVisibleMs: opts.minVisibleMs,
      note:
        "DERIVED from app_system_start_config. Not durable authority. minVisibleMs = App/Cap continuation only (F1). logoIntegrity required when brand enabled (F2).",
    };
    fs.mkdirSync(path.dirname(BUILD_PATH), { recursive: true });
    fs.writeFileSync(BUILD_PATH, `${JSON.stringify(derived, null, 2)}\n`, "utf8");
    return { derivedOk: true, logoIntegrity };
  } catch (e) {
    return {
      derivedOk: false,
      detail: e instanceof Error ? e.message : "derived_sync_failed",
    };
  }
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const { nextBuild, installed } = await getSystemStartConfig(sb);
    return NextResponse.json({
      ok: true as const,
      nextBuild,
      installed,
      /** @deprecated alias — prefer nextBuild */
      systemStart: {
        version: nextBuild.revision,
        backgroundColor: nextBuild.backgroundColor,
        brandMarkEnabled: nextBuild.brandAssetEnabled,
        logoMediaId: nextBuild.brandAssetMediaId,
        logoPreviewUrl: nextBuild.brandPreviewUrl,
        brandSizePreset: nextBuild.brandSizePreset,
        minVisibleMs: nextBuild.minVisibleMs,
      },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      brandSizePresets: BRAND_SIZE_PRESETS,
      buildBound: true,
      appliesVia: "native_app_build_update",
      notLiveCms: true,
      durableAuthority: "app_system_start_config",
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
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      backgroundColor?: string;
      brandAssetEnabled?: boolean;
      brandMarkEnabled?: boolean;
      brandAssetMediaId?: string | null;
      logoMediaId?: string | null;
      clearBrandAsset?: boolean;
      clearLogo?: boolean;
      brandSizePreset?: BrandSizePreset;
      minVisibleMs?: number;
    };

    const saved = await putSystemStartConfig(sb, {
      backgroundColor: body.backgroundColor,
      brandAssetEnabled:
        body.brandAssetEnabled !== undefined
          ? body.brandAssetEnabled
          : body.brandMarkEnabled,
      brandAssetMediaId:
        body.brandAssetMediaId !== undefined
          ? body.brandAssetMediaId
          : body.logoMediaId,
      clearBrandAsset: body.clearBrandAsset === true || body.clearLogo === true,
      brandSizePreset: body.brandSizePreset,
      minVisibleMs: body.minVisibleMs,
      updatedBy: admin.userId,
    });

    const derived = await syncDerivedBuildInput({
      revision: saved.nextBuild.revision,
      backgroundColor: saved.nextBuild.backgroundColor,
      brandAssetEnabled: saved.nextBuild.brandAssetEnabled,
      brandAssetMediaId: saved.nextBuild.brandAssetMediaId,
      brandSizePreset: saved.nextBuild.brandSizePreset,
      minVisibleMs: saved.nextBuild.minVisibleMs,
      sb,
    });

    return NextResponse.json({
      ok: true as const,
      nextBuild: saved.nextBuild,
      installed: saved.installed,
      systemStart: {
        version: saved.nextBuild.revision,
        backgroundColor: saved.nextBuild.backgroundColor,
        brandMarkEnabled: saved.nextBuild.brandAssetEnabled,
        logoMediaId: saved.nextBuild.brandAssetMediaId,
        logoPreviewUrl: saved.nextBuild.brandPreviewUrl,
        brandSizePreset: saved.nextBuild.brandSizePreset,
        minVisibleMs: saved.nextBuild.minVisibleMs,
      },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      brandSizePresets: BRAND_SIZE_PRESETS,
      buildBound: true,
      requiresNativeRebuild: true,
      derivedBuildInputSynced: derived.derivedOk,
      derivedDetail: derived.detail,
      logoIntegrity: derived.logoIntegrity ?? null,
      durableAuthority: "app_system_start_config",
      message:
        "다음 앱 버전 설정이 저장되었습니다. 앱 업데이트가 필요합니다. 서비스 적용으로 설치 앱이 바뀌지 않습니다.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "system_start_write_failed";
    const status =
      msg === "invalid_background_color" || msg === "brand_media_not_ready"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
