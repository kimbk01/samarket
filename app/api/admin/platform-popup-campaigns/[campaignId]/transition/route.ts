import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  adminApprovePlatformPopupCampaign,
  transitionPlatformPopupCampaign,
} from "@/lib/platform-popup/admin-transitions";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/platform-popup-campaigns/[campaignId]/transition
 * Server-enforced Admin approval / lifecycle. Owner/payment cannot call this route.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "approve" | "transition";
    nextStatus?: PlatformPopupCampaignStatus;
    nextApproval?: PlatformPopupApprovalStatus;
    activate?: boolean;
    schedule?: boolean;
  };

  if (body.action === "approve" || body.activate || body.schedule) {
    const result = await adminApprovePlatformPopupCampaign(sb, {
      campaignId,
      adminUserId: admin.userId,
      activate: Boolean(body.activate),
      schedule: Boolean(body.schedule) && !body.activate,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      approvalStatus: result.approvalStatus,
    });
  }

  const result = await transitionPlatformPopupCampaign(sb, {
    campaignId,
    actorUserId: admin.userId,
    actorRole: "admin",
    nextStatus: body.nextStatus,
    nextApproval: body.nextApproval,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    approvalStatus: result.approvalStatus,
  });
}
