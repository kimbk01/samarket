import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getMessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const summary = getMessengerMonitoringSummary();
  return NextResponse.json({ ok: true, summary });
}
