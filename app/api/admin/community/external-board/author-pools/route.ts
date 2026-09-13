import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { createAuthorPool, listAuthorPools } from "@/lib/external-board-import/author/author-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const pools = await listAuthorPools(sb);
    return NextResponse.json({ ok: true, pools });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    const sb = getSupabaseServer();
    const pool = await createAuthorPool(sb, name);
    return NextResponse.json({ ok: true, pool });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
