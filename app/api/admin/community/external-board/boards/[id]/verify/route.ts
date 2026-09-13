import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";
import { verifyExternalBoard } from "@/lib/external-board-import/verify/board-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const source = await getExternalBoardSource(sb, id);
    if (!source) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const result = await verifyExternalBoard(sb, source);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
