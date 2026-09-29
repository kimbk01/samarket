import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { issueSignedSourceUpload } from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mediaId: string }> };

/**
 * POST /api/admin/intro/media/[mediaId]/signed-upload
 * Narrow signed upload to assigned authority/v1/source/... path only.
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
    const issued = await issueSignedSourceUpload({
      sb,
      userId: admin.userId,
      mediaId,
    });
    return NextResponse.json({ ok: true as const, ...issued });
  } catch (err) {
    const f = toClientFailure(err);
    const status =
      err instanceof MediaPipelineError && f.category === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok: false, ...f }, { status });
  }
}
