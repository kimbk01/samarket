import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import { runPointExpireDb } from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manilaTodayYmd(now: Date = new Date()): string {
  return manilaDateKey(now.toISOString()) as string;
}

/**
 * POST /api/admin/point-expire/run — super_admin 전용 포인트 소멸 실행.
 * 기준일 기본값 = 마닐라 오늘. 실행 본체는 DB 함수 1번(`admin_run_point_expire`, 단일 트랜잭션·재실행 멱등).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { asOfDate?: string };
  const asOfDate = body.asOfDate?.trim() || manilaTodayYmd();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return NextResponse.json({ ok: false, error: "invalid_as_of_date" }, { status: 400 });
  }
  // 미래 기준일 소멸 실행 금지 (Asia/Manila 오늘까지만)
  if (asOfDate > manilaTodayYmd()) {
    return NextResponse.json({ ok: false, error: "as_of_date_in_future" }, { status: 400 });
  }
  try {
    const outcome = await runPointExpireDb(gate.sb, asOfDate, {
      id: gate.actor.userId,
      nickname: gate.actor.profile.nickname ?? "관리자",
    });
    if (!outcome.ok) {
      const status =
        outcome.error === "as_of_date_in_future" || outcome.error === "invalid_as_of_date" ? 400 : 500;
      return NextResponse.json({ ok: false, error: outcome.error }, { status });
    }
    const { ok: _ok, ...result } = outcome;
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "point_expire",
      targetId: asOfDate,
      action: "point_expire.run",
      after: { asOfDate, outcome: result },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
