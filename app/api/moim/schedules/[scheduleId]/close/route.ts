import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimScheduleSetClosed } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ scheduleId: string }> };

/** 모집 마감·다시 열기 — body { closed } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const scheduleId = requireUuid((await params).scheduleId);
  if (!scheduleId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "schedule_close", limit: 20, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ closed?: unknown }>(req);
  if (typeof body?.closed !== "boolean") return moimBadRequest();
  return moimRpcResponse(await moimScheduleSetClosed(g.userId, scheduleId, body.closed, g.sb));
}
