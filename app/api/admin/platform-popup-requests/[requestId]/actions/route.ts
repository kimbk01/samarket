import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { adminActOnPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-approve";
import { isPlatformPopupOwnerRequestAdminAction } from "@/lib/platform-popup/owner-request-types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/platform-popup-requests/[requestId]/actions
 * { action: approve|reject|revision_required|start_review, reason?, activate?, schedule? }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { requestId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    activate?: boolean;
    schedule?: boolean;
  };

  const action = String(body.action ?? "").trim();
  if (!isPlatformPopupOwnerRequestAdminAction(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const result = await adminActOnPlatformPopupOwnerRequest(sb, {
    requestId,
    adminUserId: admin.userId,
    action,
    reason: body.reason,
    activate: body.activate === true,
    schedule: body.schedule === true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: result.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    item: result.row,
    campaignId: result.campaignId ?? null,
    idempotent: result.idempotent === true,
  });
}
