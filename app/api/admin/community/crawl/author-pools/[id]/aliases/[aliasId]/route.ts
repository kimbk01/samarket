import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { deleteAuthorPoolAlias, updateAuthorPoolAlias } from "@/lib/community-crawler/author-pool-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; aliasId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { aliasId } = await params;
  const sb = getSupabaseServer();
  try {
    const body = (await req.json()) as { aliasName?: string; avatarUrl?: string | null; isActive?: boolean };
    const res = await updateAuthorPoolAlias(sb, aliasId, body);
    if (!res.ok) {
      const status = res.error === "ALIAS_CONFLICTS_WITH_MEMBER_NICKNAME" ? 400 : 500;
      return NextResponse.json(res, { status });
    }
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; aliasId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { aliasId } = await params;
  const sb = getSupabaseServer();
  try {
    await deleteAuthorPoolAlias(sb, aliasId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
