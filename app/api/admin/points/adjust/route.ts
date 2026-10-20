import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminPointsAdjustPost, handleAdminPointsBalanceGet } from "@/lib/admin/shared-handlers/admin-points-adjust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  return handleAdminPointsAdjustPost(gate, req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  return handleAdminPointsBalanceGet(gate, req);
}
