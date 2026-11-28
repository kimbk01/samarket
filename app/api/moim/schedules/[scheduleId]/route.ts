import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { getMoimSchedule, listMoimScheduleParticipants } from "@/lib/moim/server/moim-schedule-queries.server";
import { moimListCapped } from "@/lib/moim/moim-api-types";
import { loadScheduleAccess, readMoimScheduleInput } from "@/lib/moim/server/moim-schedule-input.server";
import { moimScheduleCancel, moimScheduleUpdate } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ scheduleId: string }> };

/** 일정 상세 + 참여자 (멤버만) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "schedule" });
  if (!g.ok) return g.response;
  const access = await loadScheduleAccess(g.sb, scheduleId, g.userId);
  if (!access) return moimNotFound();
  const schedule = await getMoimSchedule(g.sb, access, g.userId, scheduleId);
  if (!schedule) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  const participants = await listMoimScheduleParticipants(g.sb, schedule);
  /** R4 #6: 참여자 상한 500 에 닿으면 `participantsCapped` */
  return NextResponse.json({ ok: true, schedule, participants, participantsCapped: moimListCapped(participants.length) });
}

/** 일정 수정 (관리권자) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_update", limit: 20 });
  if (!g.ok) return g.response;
  const input = readMoimScheduleInput(await readMoimJson<Record<string, unknown>>(req));
  if (!input) return moimBadRequest();
  return moimRpcResponse(await moimScheduleUpdate(g.userId, scheduleId, input, g.sb));
}

/** 일정 취소 (관리권자) — 확정 참여자에게 알림 (R2 N-08f: 대상은 DB 가 확정자만 돌려줌) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_cancel", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const result = await moimScheduleCancel(g.userId, scheduleId, g.sb);
  if (result.ok) {
    const to = result.notify_user_ids ?? [];
    const moimId = result.moim_id;
    const title = result.title;
    notifyMoimAfterResponse(() =>
      notifyMoimMany(g.sb, to, {
        kind: "moim_schedule_cancelled",
        moimId,
        linkUrl: moimPaths.schedule(moimId, scheduleId),
        dedupeRef: scheduleId,
        vars: { title },
      })
    );
  }
  return moimRpcResponse(result);
}
