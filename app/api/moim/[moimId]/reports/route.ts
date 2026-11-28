import type { NextRequest } from "next/server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";
import { NextResponse } from "next/server";
import {
  guardMoimRead,
  guardMoimWrite,
  moimBadRequest,
  moimNotFound,
  moimRpcResponse,
  readMoimJson,
  requireUuid,
} from "@/lib/moim/server/moim-route-guard.server";
import { loadMoimAccess } from "@/lib/moim/server/moim-queries.server";
import { listMoimStaffReports } from "@/lib/moim/server/moim-staff-reports.server";
import { MOIM_REPORT_TARGET_TYPES, moimReportCreate, type MoimReportTargetType } from "@/lib/moim/server/moim-rpc.server";
import { isMoimPolicyCode } from "@/lib/moim/moim-report-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/**
 * GET — 모임 안 신고 확인 (설계 P13 「모임 안 처리」 · M6). 운영진 이상(hide_post)만.
 * 자기 모임 글·댓글·사진의 열린 신고를 대상별로 묶어 돌려준다 — 신고자 정보는 담지 않는다.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "staff_reports" });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const res = await listMoimStaffReports(g.sb, access);
  if (!res) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...res });
}

/**
 * P13 신고 — body { targetType, targetId, reasonCode, detail? }.
 * 사유 코드는 형식만 본다(R4 §3) — 운영 정책의 켜진 신고 사유인지는 RPC 가 본다(아니면 moim_report_reason_invalid).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "report", limit: 10, writeKind: "report", consentExempt: true });
  if (!g.ok) return g.response;
  /** R1 A-14: 공통 신고 상한(사용자당 시간당 40 — 피드·모임·통합 신고와 같은 프리셋) */
  const quota = await enforceUserReportQuota(g.userId, "moim");
  if (!quota.ok) return quota.response;
  const body = await readMoimJson<{ targetType?: unknown; targetId?: unknown; reasonCode?: unknown; detail?: unknown }>(req);
  const targetType = (MOIM_REPORT_TARGET_TYPES as readonly unknown[]).includes(body?.targetType) ? (body!.targetType as MoimReportTargetType) : null;
  const targetId = requireUuid(typeof body?.targetId === "string" ? body.targetId : null);
  if (!targetType || !targetId || !isMoimPolicyCode(body?.reasonCode)) return moimBadRequest();
  return moimRpcResponse(
    await moimReportCreate(g.userId, moimId, { targetType, targetId, reasonCode: body!.reasonCode as string, detail: typeof body?.detail === "string" ? body.detail : null }, g.sb)
  );
}
