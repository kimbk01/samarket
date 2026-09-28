import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { processIntroShowMedia } from "@/lib/intro-show/media-pipeline";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ showId: string; mediaId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId, mediaId } = await context.params;
  void req;
  try {
    const processed = await processIntroShowMedia(sb, { campaignId: showId, mediaId });
    return NextResponse.json({ ok: true, ...processed, status: "ready" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "process_failed" },
      { status: 400 },
    );
  }
}
