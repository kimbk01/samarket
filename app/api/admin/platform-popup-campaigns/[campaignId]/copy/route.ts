import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { copyPlatformPopupAdminCampaign } from "@/lib/platform-popup/admin-campaign-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/platform-popup-campaigns/[campaignId]/copy — 새 draft 로 복사(승인·기간 제외) */
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
  const body = (await req.json().catch(() => ({}))) as { lang?: string };
  const result = await copyPlatformPopupAdminCampaign(sb, {
    campaignId,
    adminUserId: admin.userId,
    nameSuffix: body.lang === "en" ? " (copy)" : " (복사본)",
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus ?? 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
