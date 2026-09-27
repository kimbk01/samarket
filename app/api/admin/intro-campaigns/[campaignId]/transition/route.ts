import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { transitionIntroAdminCampaign } from "@/lib/startup/intro-v2/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "pause" && body.action !== "resume" && body.action !== "archive") {
    return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  }
  const next = await transitionIntroAdminCampaign(ctx.sb, campaignId, ctx.userId, body.action);
  if (!next.ok) {
    return NextResponse.json({ ok: false, error: next.error }, { status: next.httpStatus });
  }
  return NextResponse.json({ ok: true, campaign: next.campaign });
}
