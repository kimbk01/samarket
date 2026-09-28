import { NextRequest, NextResponse } from "next/server";
import {
  createIntroV3Campaign,
  listIntroV3Campaigns,
  requireIntroAdminContext,
} from "@/lib/startup/intro-v3/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const listed = await listIntroV3Campaigns(ctx.sb);
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: listed.httpStatus });
  }
  return NextResponse.json({ ok: true, items: listed.items });
}

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const created = await createIntroV3Campaign(ctx.sb, {
    adminUserId: ctx.userId,
    name: String(body.name ?? "").trim() || "New intro V3",
  });
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: created.httpStatus });
  }
  return NextResponse.json({ ok: true, id: created.id });
}
