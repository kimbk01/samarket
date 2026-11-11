import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimPostPin } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ postId: string }> };

/** 공지 고정·해제 — body { pinned } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const postId = requireUuid((await params).postId);
  if (!postId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "post_pin", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ pinned?: unknown }>(req);
  if (typeof body?.pinned !== "boolean") return moimBadRequest();
  return moimRpcResponse(await moimPostPin(g.userId, postId, body.pinned, g.sb));
}
