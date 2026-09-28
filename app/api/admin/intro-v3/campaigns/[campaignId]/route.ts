import { NextRequest, NextResponse } from "next/server";
import {
  getIntroV3Campaign,
  requireIntroAdminContext,
  saveIntroV3Document,
} from "@/lib/startup/intro-v3/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await params;
  const loaded = await getIntroV3Campaign(ctx.sb, campaignId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.httpStatus });
  }
  return NextResponse.json({ ok: true, campaign: loaded.campaign });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { campaignId } = await params;
  const body = (await req.json().catch(() => ({}))) as { document?: unknown; name?: string };
  const saved = await saveIntroV3Document(ctx.sb, campaignId, ctx.userId, body.document, {
    name: body.name,
  });
  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, error: saved.error, issues: saved.issues ?? [] },
      { status: saved.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, campaign: saved.campaign });
}
