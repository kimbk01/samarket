import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadOpeningShowDetail } from "@/lib/opening-show/admin-loader.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ showId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { showId } = await context.params;
  const result = await loadOpeningShowDetail(sb, showId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true, show: result.detail });
}
