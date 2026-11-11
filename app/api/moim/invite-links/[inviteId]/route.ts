import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteLinkRevoke } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ inviteId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const inviteId = requireUuid((await params).inviteId);
  if (!inviteId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_link_revoke", limit: 20, writeKind: "none" });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimInviteLinkRevoke(g.userId, inviteId, g.sb));
}
