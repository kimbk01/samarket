import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimMemberNoteSet, moimMemberRoleSet } from "@/lib/moim/server/moim-rpc.server";
import { loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string; userId: string }> };

/** 역할 지정(모임장) · 운영진 메모 — body { role } 또는 { note } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const p = await params;
  const moimId = requireUuid(p.moimId);
  const target = requireUuid(p.userId);
  if (!moimId || !target) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "member_patch", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ role?: unknown; note?: unknown }>(req);
  if (body?.role === "co_host" || body?.role === "staff" || body?.role === "member") {
    const role = body.role;
    const result = await moimMemberRoleSet(g.userId, moimId, target, role, g.sb);
    if (result.ok && role !== "member") {
      await notifyMoimMany(g.sb, [target], {
        kind: "moim_role_changed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: `${target}:${role}:${new Date().toISOString().slice(0, 16)}`,
        vars: { moim: await loadMoimName(g.sb, moimId) },
        roleVar: role,
      });
    }
    return moimRpcResponse(result);
  }
  if (typeof body?.note === "string") {
    return moimRpcResponse(await moimMemberNoteSet(g.userId, moimId, target, body.note, g.sb));
  }
  return moimBadRequest();
}
