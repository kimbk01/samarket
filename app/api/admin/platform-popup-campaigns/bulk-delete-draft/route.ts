import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { adminBulkDeletePlatformPopupDraftCampaigns } from "@/lib/platform-popup/admin-campaign-delete-draft";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — bulk delete Admin Direct draft|pending_review popups only.
 * Validate-all-first: if any ID is protected/unknown → delete none.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x ?? "")) : [];

  const result = await adminBulkDeletePlatformPopupDraftCampaigns(sb, {
    campaignIds: ids,
    adminUserId: admin.userId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, rejectedId: result.rejectedId ?? null },
      { status: result.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({ ok: true, deletedIds: result.deletedIds });
}
