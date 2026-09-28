import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { publishOpeningDraft } from "@/lib/opening-show/publish.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ showId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { showId } = await context.params;
  const result = await publishOpeningDraft(sb, { showId, adminUserId: admin.userId });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, reason: result.reason ?? null },
      { status: result.httpStatus }
    );
  }
  return NextResponse.json({
    ok: true,
    revisionId: result.revisionId,
    revisionNumber: result.revisionNumber,
  });
}
