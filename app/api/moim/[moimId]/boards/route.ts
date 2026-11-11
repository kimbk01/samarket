import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimBoardUpsert } from "@/lib/moim/server/moim-rpc.server";
import { isMoimRole } from "@/lib/moim/moim-permission-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 게시판 추가·이름 변경·사용 중지 — body { boardId?, name?, writeMinRole?, isActive? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "board_upsert", limit: 20, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ boardId?: unknown; name?: unknown; writeMinRole?: unknown; isActive?: unknown }>(req)) ?? {};
  return moimRpcResponse(
    await moimBoardUpsert(
      g.userId,
      moimId,
      {
        boardId: typeof body.boardId === "string" ? body.boardId : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        writeMinRole: isMoimRole(body.writeMinRole) ? body.writeMinRole : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      g.sb
    )
  );
}
