import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/increment-view
 * 거래·통합 posts 조회수 +1 — service_role (클라이언트는 posts 직접 UPDATE 불가).
 * 실패해도 상세 UX는 유지 — 204 no-op.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const sb = getSupabaseServer();
    const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;

    const { data: row, error: readErr } = await sbAny
      .from(POSTS_TABLE_WRITE)
      .select("view_count")
      .eq("id", id)
      .maybeSingle();

    if (readErr || !row) {
      return new NextResponse(null, { status: 204 });
    }

    const next = ((row as { view_count?: number | null }).view_count ?? 0) | 0;
    const now = new Date().toISOString();
    const { error: updErr } = await sbAny
      .from(POSTS_TABLE_WRITE)
      .update({ view_count: next + 1, updated_at: now })
      .eq("id", id);

    if (updErr) {
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
