import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import {
  createIntroAdminCampaign,
  listIntroAdminCampaigns,
} from "@/lib/startup/intro-v2/admin-service";
import { introCmsListDeviceReadiness } from "@/lib/startup/intro-v2/admin-cms-phase1";
import { deriveIntroOperatorAppState } from "@/lib/startup/intro-operator-contract";
import { loadProductIntroFromDb } from "@/lib/startup/product-intro-db";
import { productIntroGenerationId } from "@/lib/startup/product-intro-native-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;

  const listed = await listIntroAdminCampaigns(ctx.sb);
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: listed.httpStatus });
  }

  const applied = await loadProductIntroFromDb(ctx.sb as never);
  const appliedCampaignId = applied.ok ? applied.config.campaignId : null;
  const appliedStatus = applied.ok ? applied.config.status : null;
  const generationId = applied.ok ? productIntroGenerationId(applied.config) : null;

  const items = listed.items.map((item) => {
    const appState = deriveIntroOperatorAppState({
      campaignId: item.id,
      status: item.status,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      appliedCampaignId,
      appliedStatus,
    });
    return {
      ...item,
      appState,
      deviceReadiness: introCmsListDeviceReadiness(appState),
      generationId: appliedCampaignId === item.id ? generationId : null,
    };
  });

  return NextResponse.json({ ok: true, items, appliedCampaignId, generationId });
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
