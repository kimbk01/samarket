import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { processIntroMedia } from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ mediaId: string }> };

/**
 * POST /api/admin/intro/media/[mediaId]/process
 * C-R1 GIF / static processing → immutable READY runtime artifact.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
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
    const result = await processIntroMedia({
      sb,
      userId: admin.userId,
      mediaId,
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch (err) {
    const f = toClientFailure(err);
    return NextResponse.json(
      { ok: false, ...f },
      { status: err instanceof MediaPipelineError ? 400 : 500 },
    );
  }
}
