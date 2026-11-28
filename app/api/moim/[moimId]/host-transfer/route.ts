import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimHostTransferRequest } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P8 모임장 위임 요청 — body { toUserId } (상대 수락 필요) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "host_transfer", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ toUserId?: unknown }>(req);
  const to = requireUuid(typeof body?.toUserId === "string" ? body.toUserId : null);
  if (!to) return moimBadRequest();
  const result = await moimHostTransferRequest(g.userId, moimId, to, g.sb);
  if (result.ok) {
    const transferId = result.transfer_id;
    /** 발송은 응답 뒤 (W5 — 3번 E1 약속) */
    notifyMoimAfterResponse(async () =>
      notifyMoimMany(g.sb, [to], {
        kind: "moim_host_transfer_requested",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: transferId,
        vars: { moim: await loadMoimName(g.sb, moimId) },
      })
    );
  }
  return moimRpcResponse(result);
}
