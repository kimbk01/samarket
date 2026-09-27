import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import {
  createIntroAdminCampaign,
  listIntroAdminCampaigns,
  listLiveIntroResolverCandidates,
} from "@/lib/startup/intro-v2/admin-service";
import { attachWinnerFlags } from "@/lib/startup/intro-v2/admin-resolver-preview";
import { deriveIntroLiveFlags } from "@/lib/startup/intro-v2/live-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;

  const listed = await listIntroAdminCampaigns(ctx.sb);
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: listed.httpStatus });
  }

  const nowIso = new Date().toISOString();
  const candidates = await listLiveIntroResolverCandidates(ctx.sb);
  const flagged = attachWinnerFlags(
    listed.items.map((item) => ({
      id: item.id,
      status: item.status,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      targeting: item.targeting,
      frequencyMode: item.frequencyMode,
    })),
    candidates,
    {
      now: nowIso,
      audience: "guest",
      platform: "android",
      deviceClass: "PHONE_ANDROID",
      frequencyEligible: true,
    }
  );
  const items = listed.items.map((item, i) => {
    const live = flagged[i];
    const flags = deriveIntroLiveFlags({
      status: item.status,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      targeting: item.targeting,
      frequencyMode: item.frequencyMode,
      nowIso,
      winnerId: live.liveNow ? item.id : null,
      campaignId: item.id,
    });
    return { ...item, liveNow: live.liveNow, derived: live.derived, flags };
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const created = await createIntroAdminCampaign(ctx.sb, {
    adminUserId: ctx.userId,
    name: String(body.name ?? "").trim() || "New intro",
  });
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: created.httpStatus });
  }
  return NextResponse.json({ ok: true, id: created.id });
}
