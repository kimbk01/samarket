import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { MOIM_REPORT_TARGET_TYPES, moimReportCreate, type MoimReportTargetType } from "@/lib/moim/server/moim-rpc.server";
import { isMoimReportReasonCode } from "@/lib/moim/moim-report-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P13 신고 — body { targetType, targetId, reasonCode, detail? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "report", limit: 10, writeKind: "report", consentExempt: true });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ targetType?: unknown; targetId?: unknown; reasonCode?: unknown; detail?: unknown }>(req);
  const targetType = (MOIM_REPORT_TARGET_TYPES as readonly unknown[]).includes(body?.targetType) ? (body!.targetType as MoimReportTargetType) : null;
  const targetId = requireUuid(typeof body?.targetId === "string" ? body.targetId : null);
  if (!targetType || !targetId || !isMoimReportReasonCode(body?.reasonCode)) return moimBadRequest();
  return moimRpcResponse(
    await moimReportCreate(g.userId, moimId, { targetType, targetId, reasonCode: body!.reasonCode as string, detail: typeof body?.detail === "string" ? body.detail : null }, g.sb)
  );
}
