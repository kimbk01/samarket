import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimJoinDecide } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; requestId: string }> };

/** P3 가입 승인·거절 — body { approve, reason } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const moimId = requireUuid(p.moimId);
  const requestId = requireUuid(p.requestId);
  if (!moimId || !requestId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join_decide", limit: 60, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ approve?: unknown; reason?: unknown }>(req);
  if (typeof body?.approve !== "boolean") return moimBadRequest();
  const reason = typeof body.reason === "string" ? body.reason : null;
  /** R5 C18: 주소의 모임과 신청의 모임이 다르면 결정을 실행하지 않는다(다른 모임 주소로 처리되어 알림만 빠지던 경우) */
  const { data: reqRow } = await g.sb.from("moim_join_requests").select("moim_id").eq("id", requestId).maybeSingle();
  if ((reqRow as { moim_id?: string } | null)?.moim_id !== moimId) {
    return NextResponse.json({ ok: false, error: "moim_request_not_found" }, { status: 404 });
  }
  const result = await moimJoinDecide(g.userId, requestId, body.approve, reason, g.sb);
  if (result.ok && result.moim_id === moimId) {
    const approve = body.approve;
    const userId = result.user_id;
    /** P3 「거절 … (사유 선택)」 — 사유가 있으면 알림에 넣는다 (R2) · 발송은 응답 뒤 (R-e) */
    const shownReason = !approve && reason ? reason.trim().slice(0, 100) : "";
    notifyMoimAfterResponse(async () =>
      notifyMoimMany(g.sb, [userId], {
        kind: approve ? "moim_join_approved" : "moim_join_rejected",
        ...(shownReason ? { variant: "with_reason" } : {}),
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: requestId,
        vars: { moim: await loadMoimName(g.sb, moimId), ...(shownReason ? { reason: shownReason } : {}) },
      })
    );
  }
  return moimRpcResponse(result);
}
