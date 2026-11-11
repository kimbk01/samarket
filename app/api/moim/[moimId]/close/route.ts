import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimClose } from "@/lib/moim/server/moim-rpc.server";
import { listActiveMoimMemberIds, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P15 모임 종료 (모임장, 이름 확인) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "close", limit: 5, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ confirmName?: unknown }>(req);
  if (typeof body?.confirmName !== "string") return moimBadRequest();
  const [members, moim] = await Promise.all([listActiveMoimMemberIds(g.sb, moimId), loadMoimName(g.sb, moimId)]);
  const result = await moimClose(g.userId, moimId, body.confirmName, g.sb);
  if (result.ok) {
    await notifyMoimMany(g.sb, members.filter((id) => id !== g.userId), {
      kind: "moim_closed",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: moimId,
      vars: { moim },
    });
  }
  return moimRpcResponse(result);
}
