import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { simulatePointExpireDb } from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { asOfDate?: string };
  const asOfDate = body.asOfDate?.trim() || new Date().toISOString().slice(0, 10);
  try {
    const result = await simulatePointExpireDb(gate.sb, asOfDate);
    if (!result) return NextResponse.json({ ok: true, result: null });
    return NextResponse.json({
      ok: true,
      result: {
        ...result,
        totalByUser: result.totalByUser,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
