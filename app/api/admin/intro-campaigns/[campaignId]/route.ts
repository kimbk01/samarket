import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { getIntroAdminCampaign, saveIntroAdminDraft } from "@/lib/startup/intro-v2/admin-service";
import type { IntroAdminDraftPatch } from "@/lib/startup/intro-v2/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const loaded = await getIntroAdminCampaign(ctx.sb, campaignId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }
  return NextResponse.json({ ok: true, campaign: loaded.campaign });
}

export async function PATCH(
  req: NextRequest,
  ctxParams: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await ctxParams.params;
  const patch = (await req.json().catch(() => ({}))) as IntroAdminDraftPatch;
  const saved = await saveIntroAdminDraft(ctx.sb, campaignId, ctx.userId, patch);
  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, error: saved.error, issues: "issues" in saved ? saved.issues ?? [] : [] },
      { status: saved.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, campaign: saved.campaign });
}
