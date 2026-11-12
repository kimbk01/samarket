import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimAlbumPin } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ itemId: string }> };

/** 앨범 상단 고정 (최대 6장) — body { pinned } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const itemId = requireUuid((await params).itemId);
  if (!itemId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "album_pin", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ pinned?: unknown }>(req);
  if (typeof body?.pinned !== "boolean") return moimBadRequest();
  return moimRpcResponse(await moimAlbumPin(g.userId, itemId, body.pinned, g.sb));
}
