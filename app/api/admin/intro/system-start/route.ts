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
import { getSystemStartLiveStatus } from "@/lib/intro/system-start/live-apply";
import { getReadyRuntimeForMedia } from "@/lib/intro/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * System Start Admin API — durable draft (PUT) + read (GET).
 * Layer B Live Apply = POST …/system-start/apply.
 * Layer A OS primitives = native build materialized stamp (installed).
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
    let live: Awaited<ReturnType<typeof getSystemStartLiveStatus>> = {
      kind: "NO_LIVE",
    };
    try {
      live = await getSystemStartLiveStatus(sb);
    } catch {
      live = { kind: "NO_LIVE" };
    }

    return NextResponse.json({
      ok: true as const,
      nextBuild,
      installed,
      live,
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
      buildBound: false,
      appliesVia: ["live_apply", "native_app_build_update"],
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
      backgroundImageMediaId?: string | null;
      clearBackgroundImage?: boolean;
      brandAssetEnabled?: boolean;
      brandMarkEnabled?: boolean;
      brandAssetMediaId?: string | null;
      logoMediaId?: string | null;
      clearBrandAsset?: boolean;
      clearLogo?: boolean;
      brandSizePreset?: BrandSizePreset;
      brandXNorm?: number;
      brandYNorm?: number;
      minVisibleMs?: number;
    };

    const saved = await putSystemStartConfig(sb, {
      backgroundColor: body.backgroundColor,
      backgroundImageMediaId: body.backgroundImageMediaId,
      clearBackgroundImage: body.clearBackgroundImage === true,
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
      brandXNorm: body.brandXNorm,
      brandYNorm: body.brandYNorm,
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
      buildBound: false,
      productionSaveWritesNativeFs: false,
      logoIntegrity,
      durableAuthority: "app_system_start_config",
      message:
        "저장 완료 — durable 초안이 저장되었습니다. 「적용」으로 다음 콜드 스타트(Layer B)에 반영하세요.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "system_start_write_failed";
    const status =
      msg === "invalid_background_color" ||
      msg === "brand_media_not_ready" ||
      msg === "background_image_not_ready" ||
      msg === "invalid_min_visible_ms" ||
      msg === "invalid_brand_size_preset"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
