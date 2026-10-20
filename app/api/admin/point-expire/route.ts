import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { parseMemberOpsListPage } from "@/lib/admin/member-ops-list/member-ops-list-page";
import {
  listPointExpireExecutionsPage,
  listPointExpireLogsPage,
  listPointExpirePolicies,
  summarizePointExpireExecutions,
} from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/point-expire (R7 목록 표준 — 예전 실행 100건·로그 200건 고정 상한 제거)
 * - 기본: `{ policies, summary: { runCount, totalExpired } }` — 실행 횟수는 count exact, 합계는 전체 합.
 * - `view=executions` + `limit`(20/50/100)·`offset`: 실행 이력 한 쪽 `{ executions, total, limit, offset }`.
 * - `view=logs` + `limit`·`offset`: 소멸 로그 한 쪽 `{ logs, total, limit, offset }`.
 * 호출자: `hooks/useAdminPointExpireData.ts`·`AdminPointExpirePage` 하나.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const sp = new URL(req.url).searchParams;
    const view = sp.get("view");
    if (view === "executions") {
      const page = parseMemberOpsListPage(sp);
      const { executions, total } = await listPointExpireExecutionsPage(gate.sb, page);
      return NextResponse.json({ ok: true, executions, total, limit: page.limit, offset: page.offset });
    }
    if (view === "logs") {
      const page = parseMemberOpsListPage(sp);
      const { logs, total } = await listPointExpireLogsPage(gate.sb, page);
      return NextResponse.json({ ok: true, logs, total, limit: page.limit, offset: page.offset });
    }
    const [policies, summary] = await Promise.all([
      listPointExpirePolicies(gate.sb),
      summarizePointExpireExecutions(gate.sb),
    ]);
    return NextResponse.json({ ok: true, policies, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
