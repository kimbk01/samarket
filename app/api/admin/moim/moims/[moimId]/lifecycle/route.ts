/**
 * POST /api/admin/moim/moims/[moimId]/lifecycle — 모임 삭제·복구 (설계 moim §6 P15 · §8). **최고관리자만**.
 * body { action: "delete"|"restore", reason } — 소프트 삭제(상태값만), 방은 보관(읽기 전용). 복구 = 종료 기록이 있으면 종료 상태로.
 */
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminDelete, moimAdminRestore } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<{ action?: unknown; reason?: unknown }>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  if (body?.action === "delete") return moimAdminRpcResponse(await moimAdminDelete(gate.actor.userId, moimId, reason, gate.sb));
  if (body?.action === "restore") return moimAdminRpcResponse(await moimAdminRestore(gate.actor.userId, moimId, reason, gate.sb));
  return moimAdminBad();
}
