import { NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { getMessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/server-store-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;
  const summary = getMessengerMonitoringSummary();
  return NextResponse.json({ ok: true, summary });
}
