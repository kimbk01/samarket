import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminPointChargesListGet } from "@/lib/admin/shared-handlers/admin-point-charges-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  return handleAdminPointChargesListGet(gate, req);
}
