import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { publishIntroAdminCampaign } from "@/lib/startup/intro-v2/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const published = await publishIntroAdminCampaign(ctx.sb, campaignId, ctx.userId);
  if (!published.ok) {
    return NextResponse.json(
      { ok: false, error: published.error, issues: published.issues ?? [] },
      { status: published.httpStatus }
    );
  }
  return NextResponse.json({
    ok: true,
    campaign: published.campaign,
    revision: published.revision,
    publicationId: published.publicationId,
  });
}
