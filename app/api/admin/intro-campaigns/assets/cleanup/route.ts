import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { cleanupUnreferencedIntroImageAssets } from "@/lib/startup/intro-v2/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as { assetIds?: unknown };
  const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map((id) => String(id)) : [];
  const cleaned = await cleanupUnreferencedIntroImageAssets(ctx.sb, assetIds);
  if (!cleaned.ok) {
    return NextResponse.json({ ok: false, error: cleaned.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: cleaned.removed });
}
