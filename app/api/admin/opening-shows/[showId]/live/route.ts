import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { setOpeningLive } from "@/lib/opening-show/publish.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { showId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { revisionId?: string };
  const revisionId = String(body.revisionId ?? "").trim();
  if (!revisionId) {
    return NextResponse.json({ ok: false, error: "revision_required" }, { status: 400 });
  }
  const result = await setOpeningLive(sb, { showId, revisionId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true });
}
