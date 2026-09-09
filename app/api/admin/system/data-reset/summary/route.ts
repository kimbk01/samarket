import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { loadDataResetDomainSummaries } from "@/lib/admin/data-reset/summary";
import { DATA_RESET_CANONICAL_ROUTE } from "@/lib/admin/data-reset/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/system/data-reset/summary — live domain counts for Admin list. */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const { rows, warnings } = await loadDataResetDomainSummaries(auth.sb);
  return NextResponse.json({
    ok: true,
    canonicalRoute: DATA_RESET_CANONICAL_ROUTE,
    rows,
    warnings,
  });
}
