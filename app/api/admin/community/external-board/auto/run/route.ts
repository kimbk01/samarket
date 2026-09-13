import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { runExternalBoardAutoPublish } from "@/lib/external-board-import/auto/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const summary = await runExternalBoardAutoPublish(sb);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
