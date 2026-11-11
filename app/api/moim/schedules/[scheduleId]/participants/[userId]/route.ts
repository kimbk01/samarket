import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimScheduleAttendance, moimScheduleDecide, moimScheduleRemoveParticipant } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ scheduleId: string; userId: string }> };

/** 관리권자: body { action: "approve" | "reject" | "remove" } 또는 { attendance: "present" | "absent" | "unknown" } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const scheduleId = requireUuid(p.scheduleId);
  const target = requireUuid(p.userId);
  if (!scheduleId || !target) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_participant", limit: 60, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ action?: unknown; attendance?: unknown }>(req)) ?? {};
  if (body.attendance === "present" || body.attendance === "absent" || body.attendance === "unknown") {
    return moimRpcResponse(await moimScheduleAttendance(g.userId, scheduleId, target, body.attendance, g.sb));
  }
  if (body.action === "remove") {
    return moimRpcResponse(await moimScheduleRemoveParticipant(g.userId, scheduleId, target, g.sb));
  }
  if (body.action === "approve" || body.action === "reject") {
    const approve = body.action === "approve";
    const result = await moimScheduleDecide(g.userId, scheduleId, target, approve, g.sb);
    if (result.ok) {
      await notifyMoimMany(g.sb, [target], {
        kind: approve ? "moim_schedule_decided_ok" : "moim_schedule_decided_no",
        moimId: result.moim_id,
        linkUrl: moimPaths.schedule(result.moim_id, scheduleId),
        dedupeRef: `${scheduleId}:${new Date().toISOString().slice(0, 16)}`,
        vars: { title: result.title },
      });
    }
    return moimRpcResponse(result);
  }
  return moimBadRequest();
}
