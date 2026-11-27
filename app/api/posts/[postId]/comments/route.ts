/**
 * GET /api/posts/[postId]/comments — 댓글 목록(+닉네임)
 * POST /api/posts/[postId]/comments — 댓글 작성 (세션)
 */
import { tradeApiError } from "@/lib/trade/trade-api-error-response";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { fetchPartnerDisplayFieldsMap } from "@/lib/chats/fetch-partner-display";

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
    return tradeApiError("service_unavailable", 500);
  }
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return tradeApiError("invalid_request", 400);

  const sbAny = sb;
  const { data: rows, error } = await sbAny
    .from("comments")
    .select("id, post_id, user_id, content, created_at, parent_id")
    .eq("post_id", id)
    .eq("hidden", false)
    .order("created_at", { ascending: true });

  if (error) {
    /** 재감사 2026-11-27: DB 원문은 로그로만, 응답은 코드 */
    console.error("[posts/comments] list failed", error.message);
    return tradeApiError("comments_load_failed", 500);
  }
  const list = (rows ?? []) as { id: string; post_id: string; user_id: string; content: string; created_at: string }[];
  const uids = [...new Set(list.map((r) => String(r.user_id ?? "").trim()).filter(Boolean))];
  const nickMap = await fetchNicknamesForUserIds(sbAny, uids);
  const partnerMap = await fetchPartnerDisplayFieldsMap(sbAny, uids);
  const comments = list.map((r) => ({
    ...r,
    user_id: String(r.user_id ?? "").trim(),
    authorNickname: nickMap.get(String(r.user_id ?? "").trim())?.trim() || "",
    authorUsername: partnerMap.get(String(r.user_id ?? "").trim())?.partnerUsername ?? null,
  }));
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return tradeApiError("service_unavailable", 500);
  }

  const signupGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId
  );
  if (!signupGate.ok) return signupGate.response;

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "community_comment"
  );
  if (!profileGate.ok) return profileGate.response;

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return tradeApiError("invalid_request", 400);

  const sbAny = sb;

  let body: { content?: string; parentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return tradeApiError("invalid_request", 400);
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return tradeApiError("content_required", 400);

  const parentIdRaw = typeof body.parentId === "string" ? body.parentId.trim() : "";
  let parentId: string | null = null;
  if (parentIdRaw) {
    const { data: parentRow, error: pErr } = await sbAny
      .from("comments")
      .select("id, post_id, parent_id")
      .eq("id", parentIdRaw)
      .maybeSingle();
    if (pErr) {
      console.error("[posts/comments] parent lookup failed", pErr);
      return tradeApiError("comment_save_failed", 500);
    }
    const p = parentRow as { id?: string; post_id?: string; parent_id?: string | null } | null;
    if (!p?.id || p.post_id !== id) {
      return tradeApiError("community_comment_parent_not_found", 400);
    }
    if (p.parent_id) {
      return tradeApiError("community_comment_depth_limit", 400);
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
    /** DB 원문(대댓글 컬럼 없음 등)은 로그로만 — 화면은 코드 */
    console.error("[posts/comments] insert failed", error);
    return tradeApiError("comment_save_failed", 500);
  }
  const row = inserted as { id?: string } | null;
  return NextResponse.json({ ok: true, id: row?.id ?? "" });
}
