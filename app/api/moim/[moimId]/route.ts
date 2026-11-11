import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { getMoimDetail } from "@/lib/moim/server/moim-queries.server";
import { moimUpdateInfo, type MoimInfoPatch } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ moimId: string }> };

/** 모임 상세 (공개 페이지 · 멤버 홈 공통) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "detail" });
  if (!g.ok) return g.response;
  const detail = await getMoimDetail(g.sb, moimId, g.userId);
  if (!detail) return moimNotFound();
  return NextResponse.json({ ok: true, moim: detail });
}

/** 모임 정보 수정 (모임장) — expectedUpdatedAt 은 상세 응답의 updatedAt 원문 그대로 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "update", limit: 20 });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ patch?: MoimInfoPatch; expectedUpdatedAt?: string }>(req);
  if (!body?.patch || typeof body.expectedUpdatedAt !== "string") return moimBadRequest();
  return moimRpcResponse(await moimUpdateInfo(g.userId, moimId, body.patch, body.expectedUpdatedAt, g.sb));
}
