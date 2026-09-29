import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  deleteIntroMediaBackend,
  getIntroMedia,
} from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mediaId: string }> };

/** GET — truthful media state for future Media Library (no UI). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  const { mediaId } = await ctx.params;
  try {
    const { media, source, runtime } = await getIntroMedia({ sb, mediaId });
    return NextResponse.json({
      ok: true as const,
      mediaId: media.media_id,
      status: media.status,
      mediaKind: media.media_kind,
      originalName: media.original_name,
      mime: media.mime,
      byteLength: media.byte_length,
      width: media.width,
      height: media.height,
      sourceIntegrity: media.source_integrity,
      sourceGenerationId: media.current_source_generation_id,
      runtimeArtifactId: media.current_runtime_artifact_id,
      failureCode: media.failure_code,
      failureMessage: media.failure_message,
      source: source
        ? {
            sourceGenerationId: source.source_generation_id,
            generation: source.generation,
            integrity: source.integrity,
            byteLength: source.byte_length,
            mime: source.mime,
            width: source.width,
            height: source.height,
            // path withheld from casual list — available for admin debug only
            storagePath: source.storage_path,
          }
        : null,
      runtime: runtime
        ? {
            runtimeArtifactId: runtime.runtime_artifact_id,
            generation: runtime.generation,
            format: runtime.format,
            integrity: runtime.integrity,
            byteLength: runtime.byte_length,
            width: runtime.width,
            height: runtime.height,
            processRecipeVersion: runtime.process_recipe_version,
            animationMetadata: runtime.animation_metadata,
            storagePath: runtime.storage_path,
          }
        : null,
    });
  } catch (err) {
    const f = toClientFailure(err);
    return NextResponse.json(
      { ok: false, ...f },
      {
        status:
          err instanceof MediaPipelineError && f.category === "NOT_FOUND"
            ? 404
            : 400,
      },
    );
  }
}

/** DELETE — backend seam; blocks draft-referenced media. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  const { mediaId } = await ctx.params;
  try {
    const result = await deleteIntroMediaBackend({
      sb,
      userId: admin.userId,
      mediaId,
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch (err) {
    const f = toClientFailure(err);
    return NextResponse.json(
      { ok: false, ...f },
      { status: err instanceof MediaPipelineError ? 409 : 500 },
    );
  }
}
