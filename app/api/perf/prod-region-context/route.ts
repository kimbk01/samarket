/**
 * GET /api/perf/prod-region-context — prod_same_region 측정용 리전 메타 (관측만).
 * `SAMARKET_PROD_PERF_MEASURE=1` 또는 development.
 */
import { NextResponse } from "next/server";
import {
  buildProdRegionContext,
  isProdPerfLogEnabled,
  logProdRegionContextOnce,
} from "@/lib/performance/prod-same-region-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isProdPerfLogEnabled()) {
    return NextResponse.json({ ok: false, error: "perf_measure_disabled" }, { status: 404 });
  }

  const clientRegion = request.headers.get("x-samarket-client-region")?.trim() || null;
  const ctx = logProdRegionContextOnce({
    client_region: clientRegion,
    runtime: "nodejs",
  });

  return NextResponse.json({ ok: true, ...ctx });
}
