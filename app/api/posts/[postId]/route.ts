/**
 * GET /api/posts/[postId] — 글 단건(거래표시용). 부모 경로 404·프리패치 대응.
 * Query: userId (선택, 추후 RLS 대비)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "postId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  let { data, error } = await sbAny
    .from("posts")
    .select("id, status, user_id, title, seller_listing_state, reserved_buyer_id, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error && /reserved_buyer_id|column .* does not exist/i.test(String(error.message))) {
    const r3 = await sbAny
      .from("posts")
      .select("id, status, user_id, title, seller_listing_state, updated_at")
      .eq("id", id)
      .maybeSingle();
    data = r3.data as typeof data;
    error = r3.error;
  }

  if (
    error &&
    /seller_listing_state/i.test(String(error.message)) &&
    /does not exist|unknown|schema cache|Could not find/i.test(String(error.message))
  ) {
    const r2 = await sbAny
      .from("posts")
      .select("id, status, user_id, title, updated_at")
      .eq("id", id)
      .maybeSingle();
    const row = r2.data as Record<string, unknown> | null;
    // seller_listing_state 컬럼 없는 DB 호환 — 응답 형식만 맞춤
    data = row
      ? ({ ...row, seller_listing_state: "inquiry" } as unknown as typeof data)
      : null;
    error = r2.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
