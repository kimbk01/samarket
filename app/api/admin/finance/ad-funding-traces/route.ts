import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdFundingTraces } from "@/lib/finance/ad-funding-trace/load-ad-funding-trace";
import type { AdsFundingRail } from "@/lib/finance/product-decision-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/ad-funding-traces */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const memberId = url.searchParams.get("memberId");
  const fundingRail = url.searchParams.get("fundingRail") as AdsFundingRail | null;
  const limit = Math.trunc(Number(url.searchParams.get("limit") || 40));

  const traces = await loadAdFundingTraces(gate.sb, {
    storeId,
    memberId,
    fundingRail: fundingRail || null,
    limit,
  });

  return NextResponse.json({ ok: true, traces });
}
