import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { runBoardCheck } from "@/lib/community-board-import/run-board-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as { sourceUrl?: string };
    const sourceUrl = String(body.sourceUrl ?? "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ ok: false, error: "source_url_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const result = await runBoardCheck({ sb, sourceUrl });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "board_check_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
