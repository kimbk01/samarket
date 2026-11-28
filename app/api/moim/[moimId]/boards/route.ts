import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimBoardReorder, moimBoardUpsert } from "@/lib/moim/server/moim-rpc.server";
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

/** 켜진 게시판 수 상한보다 넉넉한 요청 상한 (게시판 id 목록) */
const BOARD_ORDER_MAX = 50;

/**
 * R5 C4: 게시판 순서 저장 — body { order: string[] } = 켜진 게시판 id 전부, 새 순서.
 * 집합 검사(누락·중복·다른 모임 id)는 DB `moim_board_reorder` 가 한다(`moim_board_order_invalid`).
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "board_reorder", limit: 20, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ order?: unknown }>(req)) ?? {};
  if (!Array.isArray(body.order) || body.order.length === 0 || body.order.length > BOARD_ORDER_MAX) return moimBadRequest();
  const ids = body.order.map((v) => (typeof v === "string" ? requireUuid(v) : null));
  if (ids.some((v) => !v)) return moimBadRequest();
  return moimRpcResponse(await moimBoardReorder(g.userId, moimId, ids as string[], g.sb));
}
