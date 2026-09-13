import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { addAuthorAlias, listAuthorAliases } from "@/lib/external-board-import/author/author-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const aliases = await listAuthorAliases(sb, id);
    return NextResponse.json({ ok: true, aliases });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { displayName?: string; avatarUrl?: string | null };
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "displayName_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const alias = await addAuthorAlias(sb, id, {
      displayName,
      avatarUrl: body.avatarUrl ?? null,
    });
    return NextResponse.json({ ok: true, alias });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
