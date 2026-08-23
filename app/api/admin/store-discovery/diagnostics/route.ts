import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { buildAdminStoreDiscoveryDiagnostics } from "@/lib/stores/admin-store-discovery-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin Discovery Control v1 — optional public-API meta diagnostics (read-only). */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    diagnostics: buildAdminStoreDiscoveryDiagnostics(),
  });
}
