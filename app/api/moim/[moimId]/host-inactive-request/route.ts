import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimHostInactiveRequest } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/**
 * P8 미접속 모임장 변경 요청 (설계 §6 P8) — 부모임장·운영진, 모임장이 30일 이상 접속하지 않았을 때.
 * body { toUserId, reason? } → 어드민 큐(`/admin/community/moims/host-requests`)에 등록. 후보자에게는 알리지 않는다(어드민이 지정).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "host_inactive_request", limit: 5, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ toUserId?: unknown; reason?: unknown }>(req);
  const to = requireUuid(typeof body?.toUserId === "string" ? body.toUserId : null);
  if (!to) return moimBadRequest();
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;
  return moimRpcResponse(await moimHostInactiveRequest(g.userId, moimId, to, reason, g.sb));
}
