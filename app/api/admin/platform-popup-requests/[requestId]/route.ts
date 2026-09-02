import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-loader";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-popup-requests/[requestId] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { requestId } = await ctx.params;
  const item = await loadPlatformPopupOwnerRequest(sb, requestId);
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
