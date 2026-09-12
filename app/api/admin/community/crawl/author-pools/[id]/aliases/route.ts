import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { addAuthorPoolAlias } from "@/lib/community-crawler/author-pool-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const sb = getSupabaseServer();
  try {
    const body = (await req.json()) as { aliasName?: string; avatarUrl?: string | null };
    if (!body?.aliasName?.trim()) {
      return NextResponse.json({ ok: false, error: "alias_name_required" }, { status: 400 });
    }
    const res = await addAuthorPoolAlias(sb, {
      poolId: id,
      aliasName: body.aliasName.trim(),
      avatarUrl: body.avatarUrl?.trim() || null,
    });
    if (!res.ok) {
      const status = res.error === "ALIAS_CONFLICTS_WITH_MEMBER_NICKNAME" ? 400 : 500;
      return NextResponse.json(res, { status });
    }
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
