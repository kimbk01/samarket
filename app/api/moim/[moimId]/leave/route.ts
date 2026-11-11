import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimLeave } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P5 모임 나가기 (모임장은 위임 먼저) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "leave", limit: 10, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimLeave(g.userId, moimId, g.sb));
}
