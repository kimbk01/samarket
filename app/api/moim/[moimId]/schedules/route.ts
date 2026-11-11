import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listActiveMoimMemberIds, loadMoimAccess, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { listMoimSchedules } from "@/lib/moim/server/moim-schedule-queries.server";
import { moimScheduleCreate } from "@/lib/moim/server/moim-rpc.server";
import { filterMoimRecipientsByPref, moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";
import { readMoimScheduleInput } from "@/lib/moim/server/moim-schedule-input.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 일정 목록 (멤버만) — ?scope=upcoming|past */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "schedules", requireLogin: true });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const items = await listMoimSchedules(g.sb, access, g.userId, { scope: req.nextUrl.searchParams.get("scope") === "past" ? "past" : "upcoming" });
  if (!items) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  return NextResponse.json({ ok: true, items });
}

/** P10 일정 만들기 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_create", limit: 10 });
  if (!g.ok) return g.response;
  const input = readMoimScheduleInput(await readMoimJson<Record<string, unknown>>(req));
  if (!input || !input.title || !input.startsAt) return moimBadRequest();
  const result = await moimScheduleCreate(g.userId, moimId, input, g.sb);
  if (result.ok) {
    const [members, moim] = await Promise.all([listActiveMoimMemberIds(g.sb, moimId), loadMoimName(g.sb, moimId)]);
    const recipients = await filterMoimRecipientsByPref(g.sb, moimId, members.filter((id) => id !== g.userId), "schedules");
    await notifyMoimMany(g.sb, recipients, {
      kind: "moim_schedule_created",
      moimId,
      linkUrl: moimPaths.schedule(moimId, result.schedule_id),
      dedupeRef: result.schedule_id,
      vars: { moim, title: input.title },
    });
  }
  return moimRpcResponse(result);
}
