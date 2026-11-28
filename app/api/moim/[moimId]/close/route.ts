import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimClose } from "@/lib/moim/server/moim-rpc.server";
import { notifyMoimAfterResponse, notifyMoimClosedOrDeleted } from "@/lib/moim/server/moim-notify.server";
import { listActiveMoimMemberIds } from "@/lib/moim/server/moim-queries.server";

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
  const result = await moimClose(g.userId, moimId, body.confirmName, g.sb);
  if (result.ok) {
    /**
     * R2: 받는 사람은 DB 가 같은 트랜잭션에서 돌려준다 — 멤버 전원 + 함께 취소된 일정의 **확정** 참여자(N-08f).
     * 종료한 사람은 빼고(행위자), 발송은 응답 뒤(E1).
     */
    notifyMoimAfterResponse(async () => {
      /** DB 가 옛 판(반환값 없음)이면 지금 멤버로 대신한다 — 웹이 먼저 나가도 종료 알림이 0건이 되지 않게 (재감사 F2) */
      const notify = result.notify_user_ids ?? (await listActiveMoimMemberIds(g.sb, moimId));
      await notifyMoimClosedOrDeleted(g.sb, moimId, { ...result, notify_user_ids: notify }, { actorId: g.userId, kind: "closed" });
    });
  }
  return moimRpcResponse(result);
}
