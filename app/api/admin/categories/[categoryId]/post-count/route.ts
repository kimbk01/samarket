export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/categories/[categoryId]/post-count
 * 어드민 카테고리 삭제 전 게시물 수 — service_role, fail-closed.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { countPostsByCategoryServer } from "@/lib/posts/count-posts-by-category-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { categoryId } = await params;
  const id = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "categoryId 필요" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const result = await countPostsByCategoryServer(sb, id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: result.count });
  } catch {
    return NextResponse.json(
      { ok: false, error: "게시물 수를 확인할 수 없습니다." },
      { status: 500 }
    );
  }
}
