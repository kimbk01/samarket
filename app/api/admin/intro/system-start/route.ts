import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
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

/**
 * System Start Admin API — DURABLE SSOT only.
 * Production Save MUST NOT write native filesystem (/var/task/native, config/*.json).
 * Native materialization = build-time scripts/generate-system-start-build-input.mjs.
 */

async function resolveDurableLogoIntegrity(
  sb: NonNullable<ReturnType<typeof resolveServiceSupabaseForApi>>,
  brandAssetEnabled: boolean,
  brandAssetMediaId: string | null,
): Promise<string | null> {
  if (!brandAssetEnabled || !brandAssetMediaId) return null;
  const runtime = await getReadyRuntimeForMedia(sb, brandAssetMediaId);
  if (!runtime) throw new Error("brand_media_not_ready");
  return runtime.integrity;
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
    let logoIntegrity: string | null = null;
    try {
      logoIntegrity = await resolveDurableLogoIntegrity(
        sb,
        nextBuild.brandAssetEnabled,
        nextBuild.brandAssetMediaId,
      );
    } catch {
      logoIntegrity = null;
    }
    return NextResponse.json({
      ok: true as const,
      nextBuild,
      installed,
      logoIntegrity,
      /** @deprecated alias — prefer nextBuild */
      systemStart: {
        version: nextBuild.revision,
        backgroundColor: nextBuild.backgroundColor,
        brandMarkEnabled: nextBuild.brandAssetEnabled,
        logoMediaId: nextBuild.brandAssetMediaId,
        logoPreviewUrl: nextBuild.brandPreviewUrl,
        brandSizePreset: nextBuild.brandSizePreset,
        minVisibleMs: nextBuild.minVisibleMs,
        logoIntegrity,
      },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      brandSizePresets: BRAND_SIZE_PRESETS,
      buildBound: true,
      appliesVia: "native_app_build_update",
      notLiveCms: true,
      durableAuthority: "app_system_start_config",
      productionSaveWritesNativeFs: false,
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

    const logoIntegrity = await resolveDurableLogoIntegrity(
      sb,
      saved.nextBuild.brandAssetEnabled,
      saved.nextBuild.brandAssetMediaId,
    );

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
        logoIntegrity,
      },
      minVisibleMsPresets: SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
      brandSizePresets: BRAND_SIZE_PRESETS,
      buildBound: true,
      requiresNativeRebuild: true,
      derivedBuildInputSynced: false,
      productionSaveWritesNativeFs: false,
      logoIntegrity,
      durableAuthority: "app_system_start_config",
      message:
        "다음 앱 버전 설정이 저장되었습니다. 앱 업데이트가 필요합니다. 서비스 적용으로 설치 앱이 바뀌지 않습니다.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "system_start_write_failed";
    const status =
      msg === "invalid_background_color" ||
      msg === "brand_media_not_ready" ||
      msg === "invalid_min_visible_ms" ||
      msg === "invalid_brand_size_preset"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
