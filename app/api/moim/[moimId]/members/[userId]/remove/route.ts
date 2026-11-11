import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimMemberRemove } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

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
  if (result.ok) {
    await notifyMoimMany(g.sb, [target], {
      kind: "moim_member_removed",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: `${moimId}:${new Date().toISOString().slice(0, 16)}`,
      vars: { moim: await loadMoimName(g.sb, moimId) },
    });
  }
  return moimRpcResponse(result);
}
