import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { issueSignedMediaRead } from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mediaId: string }> };

/**
 * POST /api/admin/intro/media/[mediaId]/signed-read
 * Temporary signed READ for private dibay-intro.
 * Default purpose=runtime (READY only). No permanent public URL.
 * No broad Storage SELECT policy.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  let body: { purpose?: "runtime" | "source_preview"; expiresInSec?: number } =
    {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const { mediaId } = await ctx.params;
  try {
    const issued = await issueSignedMediaRead({
      sb,
      mediaId,
      purpose: body.purpose ?? "runtime",
      expiresInSec: body.expiresInSec,
    });
    return NextResponse.json({ ok: true as const, ...issued });
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
