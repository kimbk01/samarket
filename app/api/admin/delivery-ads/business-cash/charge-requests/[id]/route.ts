import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/delivery-ads/business-cash/charge-requests/[id] */
export async function PATCH(
  _req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  // A-07 — 쓰기는 같은 도메인 actions 경로와 같은 `business` 권한 검사.
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { ok: false, error: "historical_ads_charge_request_read_only" },
    { status: 410 }
  );
}
