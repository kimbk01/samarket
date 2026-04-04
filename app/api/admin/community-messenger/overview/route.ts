import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getAdminCommunityMessengerDashboard } from "@/lib/admin-community-messenger/service";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const data = await getAdminCommunityMessengerDashboard();
  return NextResponse.json({ ok: true, ...data });
}
