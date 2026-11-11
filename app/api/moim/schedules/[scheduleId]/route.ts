import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { getMoimSchedule, listMoimScheduleParticipants } from "@/lib/moim/server/moim-schedule-queries.server";
import { loadScheduleAccess, readMoimScheduleInput } from "@/lib/moim/server/moim-schedule-input.server";
import { moimScheduleCancel, moimScheduleUpdate } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ scheduleId: string }> };

/** 일정 상세 + 참여자 (멤버만) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "schedule", requireLogin: true });
  if (!g.ok) return g.response;
  const access = await loadScheduleAccess(g.sb, scheduleId, g.userId);
  if (!access) return moimNotFound();
  const schedule = await getMoimSchedule(g.sb, access, g.userId, scheduleId);
  if (!schedule) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  return NextResponse.json({ ok: true, schedule, participants: await listMoimScheduleParticipants(g.sb, schedule) });
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

/** 일정 취소 (관리권자) — 확정·신청자에게 알림 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_cancel", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const result = await moimScheduleCancel(g.userId, scheduleId, g.sb);
  if (result.ok) {
    await notifyMoimMany(g.sb, result.notify_user_ids ?? [], {
      kind: "moim_schedule_cancelled",
      moimId: result.moim_id,
      linkUrl: moimPaths.schedule(result.moim_id, scheduleId),
      dedupeRef: scheduleId,
      vars: { title: result.title },
    });
  }
  return moimRpcResponse(result);
}
