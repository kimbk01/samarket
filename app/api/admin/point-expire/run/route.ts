import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { runPointExpireDb } from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { asOfDate?: string };
  const asOfDate = body.asOfDate?.trim() || new Date().toISOString().slice(0, 10);
  try {
    const outcome = await runPointExpireDb(gate.sb, asOfDate, {
      type: "admin",
      id: gate.actor.userId,
      nickname: gate.actor.profile.nickname ?? "관리자",
    });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
