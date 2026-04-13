import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { buildAdminDashboardPayload } from "@/lib/admin-dashboard/build-admin-dashboard-payload";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const payload = await buildAdminDashboardPayload();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }
}
