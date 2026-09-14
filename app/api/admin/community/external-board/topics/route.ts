import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listWriteEligibleTopicsForExternalImport } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin select: writeEligible community_topics only (id authority). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const topics = await listWriteEligibleTopicsForExternalImport(sb);
    return NextResponse.json({ ok: true, topics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
