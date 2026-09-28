import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadReadyOpeningMedia } from "@/lib/opening-show/admin-loader.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const showId = new URL(req.url).searchParams.get("showId")?.trim() ?? "";
  if (!showId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await loadReadyOpeningMedia(sb, showId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, media: result.media });
}
