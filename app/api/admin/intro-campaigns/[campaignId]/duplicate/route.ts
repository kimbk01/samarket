import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { duplicateIntroAdminCampaign } from "@/lib/startup/intro-v2/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const duplicated = await duplicateIntroAdminCampaign(ctx.sb, campaignId, ctx.userId);
  if (!duplicated.ok) {
    return NextResponse.json({ ok: false, error: duplicated.error }, { status: duplicated.httpStatus });
  }
  return NextResponse.json({ ok: true, id: duplicated.id });
}
