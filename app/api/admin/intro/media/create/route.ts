import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { createIntroMedia } from "@/lib/intro/media/service";
import { MediaPipelineError, toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/intro/media/create
 * requireAdmin → service_role. No READY. No runtime artifact.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  let body: {
    mediaKind?: "IMAGE" | "LOGO" | "GIF";
    originalName?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const created = await createIntroMedia({
      sb,
      userId: admin.userId,
      mediaKind: body.mediaKind,
      originalName: body.originalName,
    });
    return NextResponse.json({ ok: true as const, ...created });
  } catch (err) {
    const f = toClientFailure(err);
    const status = err instanceof MediaPipelineError ? 400 : 500;
    return NextResponse.json({ ok: false, ...f }, { status });
  }
}
