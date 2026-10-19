import { NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { getAdminCommunityMessengerDashboard } from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  const data = await getAdminCommunityMessengerDashboard();
  return NextResponse.json({ ok: true, ...data });
}
