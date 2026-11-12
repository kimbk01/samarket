/**
 * POST /api/admin/moim/sanctions/[sanctionId] — 제재 해제 (설계 moim §6 P14). 권한 키 `moim`. body { reason }
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminSanctionRevoke } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ sanctionId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sanctionId = moimAdminUuid((await params).sanctionId);
  if (!sanctionId) return moimAdminBad("moim_sanction_not_found", 404);
  const body = await moimAdminJson<{ reason?: unknown }>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  return moimAdminRpcResponse(await moimAdminSanctionRevoke(gate.actor.userId, sanctionId, reason, gate.sb));
}
