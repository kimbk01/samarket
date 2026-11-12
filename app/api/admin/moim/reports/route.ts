/**
 * GET /api/admin/moim/reports — 모임 신고 큐 (설계 moim §8 「모임 신고 처리」 · M5 = 읽기 전용, 처리는 M6). 권한 키 `moim`.
 * query: status=received|reviewing|actioned|dismissed · type(대상 유형) · moimId · view=group(같은 모임 묶음) · limit · offset
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_REPORT_STATUSES, MOIM_ADMIN_REPORT_TARGET_TYPES, type MoimAdminReportStatus, type MoimAdminReportTargetType } from "@/lib/admin/moim/moim-admin-contract";
import { groupAdminMoimReports, listAdminMoimReports, parseMoimAdminPage } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminReadError, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const typeRaw = sp.get("type");
  const status = (MOIM_ADMIN_REPORT_STATUSES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as MoimAdminReportStatus) : null;
  const targetType = (MOIM_ADMIN_REPORT_TARGET_TYPES as readonly string[]).includes(typeRaw ?? "") ? (typeRaw as MoimAdminReportTargetType) : null;
  const page = parseMoimAdminPage(sp);
  if (sp.get("view") === "group") {
    const res = await groupAdminMoimReports(gate.sb, { status, targetType, ...page });
    if (!res.ok) return moimAdminReadError(res.error);
    return NextResponse.json(res);
  }
  const res = await listAdminMoimReports(gate.sb, { status, targetType, moimId: moimAdminUuid(sp.get("moimId")), ...page });
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}
