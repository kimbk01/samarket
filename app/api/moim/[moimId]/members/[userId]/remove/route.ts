import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimMemberRemove } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; userId: string }> };

/** P6 내보내기 · 차단 — body { ban, reason } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const moimId = requireUuid(p.moimId);
  const target = requireUuid(p.userId);
  if (!moimId || !target) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "member_remove", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ ban?: unknown; reason?: unknown }>(req)) ?? {};
  const result = await moimMemberRemove(g.userId, moimId, target, body.ban === true, typeof body.reason === "string" ? body.reason : null, g.sb);
  /** R2 N-08d: 활동 멤버였을 때만(비회원 차단은 알리지 않음) · 키 = 대상:밀리초(R-c) · 응답 뒤(R-e) */
  if (result.ok && result.was_active) {
    const ref = `${moimId}:${target}:${Date.now()}`;
    notifyMoimAfterResponse(async () =>
      notifyMoimMany(g.sb, [target], {
        kind: "moim_member_removed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: ref,
        vars: { moim: await loadMoimName(g.sb, moimId) },
      })
    );
  }
  return moimRpcResponse(result);
}
