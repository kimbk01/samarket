import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { runPointExpireDb } from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manilaTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { asOfDate?: string };
  const asOfDate = body.asOfDate?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return NextResponse.json({ ok: false, error: "invalid_as_of_date" }, { status: 400 });
  }
  // 미래 기준일 소멸 실행 금지 (Asia/Manila 오늘까지만)
  if (asOfDate > manilaTodayYmd()) {
    return NextResponse.json({ ok: false, error: "as_of_date_in_future" }, { status: 400 });
  }
  try {
    const outcome = await runPointExpireDb(gate.sb, asOfDate, {
      type: "admin",
      id: gate.actor.userId,
      nickname: gate.actor.profile.nickname ?? "관리자",
    });
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "point_expire",
      targetId: asOfDate,
      action: "point_expire.run",
      after: {
        asOfDate,
        outcome: (outcome ?? null) as unknown as Record<string, unknown> | null,
      },
    });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
