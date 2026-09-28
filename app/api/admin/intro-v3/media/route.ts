import { NextResponse } from "next/server";
import { listIntroV3ReadyMedia, requireIntroAdminContext } from "@/lib/startup/intro-v3/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const listed = await listIntroV3ReadyMedia(ctx.sb);
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: listed.httpStatus });
  }
  return NextResponse.json({ ok: true, items: listed.items });
}
