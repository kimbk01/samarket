import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { getIntroAdminCampaign } from "@/lib/startup/intro-v2/admin-service";
import { validateIntroCampaignDraft, validateIntroCampaignForPublish } from "@/lib/startup/intro-v2/admin-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const loaded = await getIntroAdminCampaign(ctx.sb, campaignId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }
  const result =
    body.mode === "draft"
      ? validateIntroCampaignDraft(loaded.campaign)
      : validateIntroCampaignForPublish(loaded.campaign);
  return NextResponse.json({ ok: true, valid: result.ok, issues: result.issues });
}
