import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimPermissionsSet } from "@/lib/moim/server/moim-rpc.server";
import { MOIM_ACTIONS, isMoimRole, type MoimAction, type MoimRole } from "@/lib/moim/moim-permission-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 멤버 권한 관리 (모임장) — body { overrides: { action: role } } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "permissions", limit: 20, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ overrides?: Record<string, unknown> }>(req);
  if (!body?.overrides || typeof body.overrides !== "object") return moimBadRequest();
  const overrides: Partial<Record<MoimAction, MoimRole>> = {};
  for (const [k, v] of Object.entries(body.overrides)) {
    if ((MOIM_ACTIONS as readonly string[]).includes(k) && isMoimRole(v)) overrides[k as MoimAction] = v;
  }
  return moimRpcResponse(await moimPermissionsSet(g.userId, moimId, overrides, g.sb));
}
