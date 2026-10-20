import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
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

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; reason?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x ?? "")) : [];
  // R2 — 삭제(L3)는 처리 사유 필수. 삭제 감사 기록(after_json.reason)에 남긴다.
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const result = await adminBulkDeletePlatformPopupDraftCampaigns(sb, {
    campaignIds: ids,
    adminUserId: admin.userId,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, rejectedId: result.rejectedId ?? null },
      { status: result.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({ ok: true, deletedIds: result.deletedIds });
}
