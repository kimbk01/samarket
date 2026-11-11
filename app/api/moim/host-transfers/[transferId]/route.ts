import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimHostTransferRespond } from "@/lib/moim/server/moim-rpc.server";
import { listActiveMoimMemberIds, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ transferId: string }> };

/** P8 위임 수락·거절 — body { accept, nickname? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const transferId = requireUuid((await params).transferId);
  if (!transferId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "host_transfer_respond", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ accept?: unknown }>(req);
  if (typeof body?.accept !== "boolean") return moimBadRequest();
  const result = await moimHostTransferRespond(g.userId, transferId, body.accept, g.sb);
  if (result.ok && result.accepted && result.moim_id) {
    const moimId = result.moim_id;
    const [members, moim] = await Promise.all([listActiveMoimMemberIds(g.sb, moimId), loadMoimName(g.sb, moimId)]);
    const { data: me } = await g.sb.from("moim_members").select("nickname").eq("moim_id", moimId).eq("user_id", g.userId).maybeSingle();
    await notifyMoimMany(g.sb, members.filter((id) => id !== g.userId), {
      kind: "moim_host_changed",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: transferId,
      vars: { moim, name: ((me as { nickname?: string } | null)?.nickname ?? "").trim() },
    });
  }
  return moimRpcResponse(result);
}
