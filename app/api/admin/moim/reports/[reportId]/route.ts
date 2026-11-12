/**
 * GET /api/admin/moim/reports/[reportId] — 모임 신고 상세 (대상 미리보기 · 신고자 · 같은 대상 신고 이력). 권한 키 `moim`. 읽기 전용.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminMoimReportDetail } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminBad, moimAdminReadError, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ reportId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const reportId = moimAdminUuid((await params).reportId);
  if (!reportId) return moimAdminBad("report_not_found", 404);
  const res = await loadAdminMoimReportDetail(gate.sb, reportId);
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}
