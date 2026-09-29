import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { confirmSourceUpload } from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mediaId: string }> };

/**
 * POST /api/admin/intro/media/[mediaId]/confirm-upload
 * Verifies source object + bytes; marks UPLOADED. Never READY.
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
    const confirmed = await confirmSourceUpload({
      sb,
      userId: admin.userId,
      mediaId,
    });
    return NextResponse.json({ ok: true as const, ...confirmed });
  } catch (err) {
    const f = toClientFailure(err);
    return NextResponse.json(
      { ok: false, ...f },
      { status: err instanceof MediaPipelineError ? 400 : 500 },
    );
  }
}
