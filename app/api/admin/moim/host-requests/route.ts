/**
 * GET /api/admin/moim/host-requests — 미접속 모임장 변경 요청 큐 (설계 moim §6 P8 · §8). 권한 키 `moim`.
 * query: status=requested(기본)|done|declined|cancelled|all · limit · offset
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_HOST_REQUEST_STATUSES, pickEnum } from "@/lib/admin/moim/moim-admin-contract";
import { listAdminMoimHostRequests, parseMoimAdminPage } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminReadError } from "@/lib/admin/moim/moim-admin-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const res = await listAdminMoimHostRequests(gate.sb, {
    status: pickEnum(MOIM_ADMIN_HOST_REQUEST_STATUSES, sp.get("status"), "requested"),
    ...parseMoimAdminPage(sp),
  });
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}
