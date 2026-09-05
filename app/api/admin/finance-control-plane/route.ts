import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadFinanceControlPlane } from "@/lib/admin/finance-control-plane/load-finance-control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance-control-plane
 * Read-only Common Finance Control Plane composition.
 */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  try {
    const model = await loadFinanceControlPlane(gate.sb);
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    console.error("[finance-control-plane]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
