import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimAlbumRemove } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ itemId: string }> };

/** 사진 삭제(올린 사람) · 숨김(운영진) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const itemId = requireUuid((await params).itemId);
  if (!itemId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "album_remove", limit: 30, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimAlbumRemove(g.userId, itemId, g.sb));
}
