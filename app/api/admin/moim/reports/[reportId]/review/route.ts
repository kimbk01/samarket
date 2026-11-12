/**
 * POST /api/admin/moim/reports/[reportId]/review — 모임 신고 검토 시작 (접수 → 검토 중 · 설계 moim §8 「모임 신고 처리」 · M6).
 * 권한 키 `moim`. 접수 상태가 아니면 409 (다른 관리자가 먼저 바꿈). 운영 기록은 SQL 이 같은 트랜잭션에서 남긴다.
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { moimAdminBad, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminReportReview } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ reportId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const reportId = moimAdminUuid((await params).reportId);
  if (!reportId) return moimAdminBad("moim_report_not_found", 404);
  return moimAdminRpcResponse(await moimAdminReportReview(gate.actor.userId, reportId, gate.sb));
}
