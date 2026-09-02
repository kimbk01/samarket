import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadPlatformPopupAdminCampaignDetail } from "@/lib/platform-popup/admin-campaign-loader";
import { updatePlatformPopupAdminCampaign } from "@/lib/platform-popup/admin-campaign-writer";
import type { PlatformPopupMaterialField } from "@/lib/platform-popup/admin-campaign-authority";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-popup-campaigns/[campaignId] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const result = await loadPlatformPopupAdminCampaignDetail(sb, campaignId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, campaign: result.campaign });
}

/** PATCH /api/admin/platform-popup-campaigns/[campaignId] — explicit Save */
export async function PATCH(
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
    name?: string;
    priority?: number;
    startAt?: string | null;
    endAt?: string | null;
    timezone?: string;
    suppressionMode?: string;
    suppressionDurationSeconds?: number | null;
    ctaType?: string;
    ctaTarget?: string;
    externalUrl?: string | null;
    surfaces?: string[];
    materialTouched?: PlatformPopupMaterialField[];
  };

  const result = await updatePlatformPopupAdminCampaign(sb, {
    campaignId,
    adminUserId: admin.userId,
    patch: body,
    materialTouched: body.materialTouched,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    id: result.id,
    revertedToReview: result.revertedToReview,
  });
}
