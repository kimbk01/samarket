import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { MeetingFeedPostDTO } from "@/lib/neighborhood/types";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

async function resolveJoinedStatus(
  sb: ReturnType<typeof getSupabaseServer>,
  meetingId: string,
  userId: string
): Promise<boolean> {
  const { data } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "joined")
    .maybeSingle();
  return !!(data as { id?: string } | null)?.id;
}

/** GET /api/philife/meetings/[meetingId]/feed — 피드 목록 (승인된 멤버 전용) */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const isJoined = await resolveJoinedStatus(sb, id, auth.userId);
  if (!isJoined) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { data, error } = await sb
    .from("meeting_feed_posts")
    .select("id, meeting_id, author_user_id, post_type, content, is_pinned, is_hidden, created_at")
    .eq("meeting_id", id)
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const posts = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    meeting_id: String(row.meeting_id ?? id),
    author_user_id: String(row.author_user_id ?? ""),
    author_name: String(row.author_user_id ?? "").slice(0, 8),
    post_type: String(row.post_type ?? "normal") as MeetingFeedPostDTO["post_type"],
    content: String(row.content ?? ""),
    is_pinned: !!row.is_pinned,
    is_hidden: !!row.is_hidden,
    created_at: String(row.created_at ?? ""),
  }));

  return NextResponse.json({ ok: true, posts });
}

/** POST /api/philife/meetings/[meetingId]/feed — 피드 글 작성 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { content?: string; post_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content) return NextResponse.json({ ok: false, error: "empty_content" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });

  const validTypes = ["normal", "notice", "intro", "attendance", "review"] as const;
  const rawType = String(body.post_type ?? "normal");
  const postType: MeetingFeedPostDTO["post_type"] = validTypes.includes(rawType as (typeof validTypes)[number])
    ? (rawType as MeetingFeedPostDTO["post_type"])
    : "normal";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const isJoined = await resolveJoinedStatus(sb, id, auth.userId);
  if (!isJoined) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const uid = auth.userId.trim();
  const { data: mRow } = await sb
    .from("meetings")
    .select("allow_feed, host_user_id, created_by")
    .eq("id", id)
    .maybeSingle();
  const m = mRow as {
    allow_feed?: boolean | null;
    host_user_id?: string | null;
    created_by?: string | null;
  } | null;
  const allowFeed = m?.allow_feed !== false;
  if (!allowFeed) {
    const hostLike =
      String(m?.host_user_id ?? "").trim() === uid || String(m?.created_by ?? "").trim() === uid;
    if (!hostLike) {
      const { data: memRow } = await sb
        .from("meeting_members")
        .select("role")
        .eq("meeting_id", id)
        .eq("user_id", uid)
        .eq("status", "joined")
        .maybeSingle();
      const role = (memRow as { role?: string } | null)?.role;
      if (role !== "host" && role !== "co_host") {
        return NextResponse.json({ ok: false, error: "feed_disabled" }, { status: 403 });
      }
    }
  }

  const { data, error } = await sb
    .from("meeting_feed_posts")
    .insert({
      meeting_id: id,
      author_user_id: auth.userId,
      post_type: postType,
      content,
    })
    .select("id, meeting_id, author_user_id, post_type, content, is_pinned, is_hidden, created_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    post: {
      id: String(row.id),
      meeting_id: String(row.meeting_id ?? id),
      author_user_id: auth.userId,
      author_name: auth.userId.slice(0, 8),
      post_type: postType,
      content,
      is_pinned: false,
      is_hidden: false,
      created_at: String(row.created_at ?? new Date().toISOString()),
    } satisfies MeetingFeedPostDTO,
  });
}
