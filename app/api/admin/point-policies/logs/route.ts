import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { parseMemberOpsListPage } from "@/lib/admin/member-ops-list/member-ops-list-page";
import { listPointPolicyLogsPage } from "@/lib/points/point-policy-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/point-policies/logs — 정책 변경 로그 서버 페이지 (R7 · 예전 100건 고정 상한 제거).
 * Query: `limit`(20/50/100, 그 외 20)·`offset`. Response: `{ ok, logs, total, limit, offset }`.
 * 호출자: `AdminPointPolicyPage` 「변경 로그」 탭 하나.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const page = parseMemberOpsListPage(new URL(req.url).searchParams);
    const { logs, total } = await listPointPolicyLogsPage(gate.sb, page);
    return NextResponse.json({ ok: true, logs, total, limit: page.limit, offset: page.offset });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
