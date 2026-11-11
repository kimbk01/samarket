import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimMemberUnban } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; userId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const moimId = requireUuid(p.moimId);
  const target = requireUuid(p.userId);
  if (!moimId || !target) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "member_unban", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimMemberUnban(g.userId, moimId, target, g.sb));
}
