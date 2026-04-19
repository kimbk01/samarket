/**
 * GET /api/posts/[postId]/comments — 댓글 목록(+닉네임)
 * POST /api/posts/[postId]/comments — 댓글 작성 (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
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
  if (!id) return NextResponse.json({ error: "postId 필요" }, { status: 400 });

  const sbAny = sb;
  const { data: rows, error } = await sbAny
    .from("comments")
    .select("id, post_id, user_id, content, created_at, parent_id")
    .eq("post_id", id)
    .eq("hidden", false)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (rows ?? []) as { id: string; post_id: string; user_id: string; content: string; created_at: string }[];
  const uids = [...new Set(list.map((r) => String(r.user_id ?? "").trim()).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sbAny, uids);
  const comments = list.map((r) => ({
    ...r,
    user_id: String(r.user_id ?? "").trim(),
    authorNickname: nickMap.get(String(r.user_id ?? "").trim())?.trim() || "",
  }));
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });

  const sbAny = sb;

  let body: { content?: string; parentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "content 필요" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ ok: false, error: "댓글 내용을 입력해 주세요." }, { status: 400 });

  const parentIdRaw = typeof body.parentId === "string" ? body.parentId.trim() : "";
  let parentId: string | null = null;
  if (parentIdRaw) {
    const { data: parentRow, error: pErr } = await sbAny
      .from("comments")
      .select("id, post_id, parent_id")
      .eq("id", parentIdRaw)
      .maybeSingle();
    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    const p = parentRow as { id?: string; post_id?: string; parent_id?: string | null } | null;
    if (!p?.id || p.post_id !== id) {
      return NextResponse.json({ ok: false, error: "원 댓글을 찾을 수 없습니다." }, { status: 400 });
    }
    if (p.parent_id) {
      return NextResponse.json({ ok: false, error: "대댓글에는 다시 답글을 달 수 없습니다." }, { status: 400 });
    }
    parentId = p.id;
  }

  const db = sb as any;
  const insertPayload: Record<string, unknown> = {
    post_id: id,
    user_id: auth.userId,
    content: content.slice(0, 2000),
    created_at: new Date().toISOString(),
  };
  if (parentId) insertPayload.parent_id = parentId;

  const { data: inserted, error } = await db.from("comments").insert(insertPayload).select("id").single();

  if (error) {
    const msg = String(error.message ?? "");
    if (/parent_id|column/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "대댓글 컬럼이 없습니다. Supabase에 마이그레이션 comments.parent_id(20250322170000)를 적용해 주세요.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message ?? "등록 실패" }, { status: 500 });
  }
  const row = inserted as { id?: string } | null;
  return NextResponse.json({ ok: true, id: row?.id ?? "" });
}
