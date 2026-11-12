/**
 * GET /api/admin/moim/sanctions — 모임 제재 이력 (설계 moim §8 「제재 이력」). 권한 키 `moim`.
 * query: filter=active|expiring(7일 안 만료)|expired|revoked|all · moimId · limit · offset
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_SANCTION_FILTERS, pickEnum } from "@/lib/admin/moim/moim-admin-contract";
import { listAdminMoimSanctions, parseMoimAdminPage } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminReadError, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const res = await listAdminMoimSanctions(gate.sb, {
    filter: pickEnum(MOIM_ADMIN_SANCTION_FILTERS, sp.get("filter"), "active"),
    moimId: moimAdminUuid(sp.get("moimId")),
    ...parseMoimAdminPage(sp),
  });
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}
