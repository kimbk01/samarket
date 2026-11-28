import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimScheduleJoin, moimScheduleLeave } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ scheduleId: string }> };

/** 일정 참여 — body { motivation? } (승인제면 신청 → 호스트 알림) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_join", limit: 20 });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ motivation?: unknown }>(req)) ?? {};
  const result = await moimScheduleJoin(g.userId, scheduleId, typeof body.motivation === "string" ? body.motivation : null, g.sb);
  if (result.ok && result.status === "requested" && result.host_user_id && result.moim_id) {
    const host = result.host_user_id;
    const moimId = result.moim_id;
    const title = result.title ?? "";
    const ref = `${scheduleId}:${g.userId}:${Date.now()}`;
    /** 행위자 = 신청자(N-08a) · 키 밀리초(R-c) · 응답 뒤(R-e) */
    notifyMoimAfterResponse(() =>
      notifyMoimMany(g.sb, [host], {
        kind: "moim_schedule_requested",
        moimId,
        linkUrl: moimPaths.schedule(moimId, scheduleId),
        dedupeRef: ref,
        vars: { title },
        actorId: g.userId,
      })
    );
  }
  return moimRpcResponse(result);
}

/** 참여 취소(본인) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_leave", limit: 20, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimScheduleLeave(g.userId, scheduleId, g.sb));
}
