/**
 * POST /api/chat/community/start — 게시글/댓글 맥락 필수 1:1 커뮤니티 채팅
 * - legacy: public.posts + public.comments
 * - 피드: public.community_posts + public.community_comments
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";

function normUid(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 필라이프: `meetings.post_id` 가 있으면 모임 글 → 게시글/댓글 문의 DM 비허용 */
async function isNeighborhoodMeetupPost(sb: ReturnType<typeof getSupabaseServer>, postId: string): Promise<boolean> {
  const { count, error } = await sb
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const requesterId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const sbAny = sb;
  const access = await assertVerifiedMemberForAction(sbAny as any, requesterId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  let body: { postId?: string; peerUserId?: string; commentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "postId, peerUserId 필요" }, { status: 400 });
  }
  const postId = normUid(body.postId);
  const peerUserId = normUid(body.peerUserId);
  const commentId = body.commentId != null && body.commentId !== "" ? normUid(body.commentId) : "";

  if (!postId || !peerUserId) {
    return NextResponse.json({ ok: false, error: "postId, peerUserId 필요" }, { status: 400 });
  }
  if (requesterId === peerUserId) {
    return NextResponse.json({ ok: false, error: "자기 자신과는 채팅할 수 없습니다." }, { status: 400 });
  }

  const feedId = (await resolveCanonicalCommunityPostId(postId)) ?? postId;
  if (process.env.NODE_ENV !== "production") {
    const samplePost = getNeighborhoodDevSamplePost(feedId);
    if (samplePost) {
      if (peerUserId !== samplePost.author_id) {
        return NextResponse.json(
          { ok: false, error: "게시글 작성자에게만 문의할 수 있습니다." },
          { status: 403 }
        );
      }
      const state = (globalThis as {
        __samarketNeighborhoodDevSampleState?: {
          inquiryRooms?: Array<{
            id: string;
            post_id: string;
            initiator_id: string;
            peer_id: string;
            context_type: "post" | "comment";
            related_comment_id: string | null;
            created_at: string;
          }>;
          relations?: Map<string, { follows: Set<string>; blocks: Set<string> }>;
          chatMessages?: Map<string, Array<{
            id: string;
            roomId: string;
            senderId: string;
            message: string;
            messageType?: "text" | "image" | "system";
            createdAt: string;
            isRead: boolean;
            readAt: string | null;
          }>>;
        };
      }).__samarketNeighborhoodDevSampleState;
      const requesterRel = state?.relations?.get(requesterId);
      const peerRel = state?.relations?.get(peerUserId);
      if (requesterRel?.blocks?.has(peerUserId) || peerRel?.blocks?.has(requesterId)) {
        return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
      }
      if (!state?.inquiryRooms || !state.chatMessages) {
        return NextResponse.json({ ok: false, error: "샘플 채팅 상태를 준비하지 못했습니다." }, { status: 500 });
      }
      const existing = state.inquiryRooms.find(
        (room) =>
          room.post_id === feedId &&
          room.related_comment_id === (commentId || null) &&
          new Set([room.initiator_id, room.peer_id]).has(requesterId) &&
          new Set([room.initiator_id, room.peer_id]).has(peerUserId)
      );
      if (existing) {
        return NextResponse.json({ ok: true, roomId: existing.id, created: false, fallback: "dev_samples" });
      }
      const roomId = `sample-community-room-${Date.now()}`;
      state.inquiryRooms.unshift({
        id: roomId,
        post_id: feedId,
        initiator_id: requesterId,
        peer_id: peerUserId,
        context_type: commentId ? "comment" : "post",
        related_comment_id: commentId || null,
        created_at: new Date().toISOString(),
      });
      state.chatMessages.set(roomId, [
        {
          id: `${roomId}-system`,
          roomId,
          senderId: "",
          message: "게시글 문의 채팅이 시작되었습니다.",
          messageType: "system",
          createdAt: new Date().toISOString(),
          isRead: true,
          readAt: new Date().toISOString(),
        },
      ]);
      return NextResponse.json({ ok: true, roomId, created: true, fallback: "dev_samples" });
    }
  }
  const { data: feedPost } = await sbAny
    .from("community_posts")
    .select("id, user_id, is_hidden")
    .eq("id", feedId)
    .maybeSingle();
  const feed = feedPost as { id?: string; user_id?: string; is_hidden?: boolean } | null;

  let postAuthor: string | null = null;
  let useFeedRoom = false;
  let canonicalFeedPostId = postId;

  if (feed && feed.id && !feed.is_hidden) {
    if (await isNeighborhoodMeetupPost(sbAny, feed.id)) {
      return NextResponse.json(
        {
          ok: false,
          error: "모임 글에서는 게시글·댓글 문의 채팅을 열 수 없습니다. 모임방 채팅을 이용해 주세요.",
        },
        { status: 403 }
      );
    }
    useFeedRoom = true;
    canonicalFeedPostId = feed.id;
    postAuthor = normUid(feed.user_id);
  } else {
    const { data: postRow, error: postErr } = await sbAny.from("posts").select("*").eq("id", postId).maybeSingle();
    if (postErr || !postRow) {
      return NextResponse.json({ ok: false, error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }
    const post = postRow as Record<string, unknown>;
    postAuthor = postAuthorUserId(post) ?? null;
  }

  if (!postAuthor) {
    return NextResponse.json({ ok: false, error: "게시글 작성자 정보가 없습니다." }, { status: 400 });
  }

  let commentAuthor: string | null = null;
  if (commentId) {
    if (useFeedRoom) {
      const { data: cRow } = await sbAny
        .from("community_comments")
        .select("id, post_id, user_id")
        .eq("id", commentId)
        .maybeSingle();
      const c = cRow as { id?: string; post_id?: string; user_id?: string } | null;
      if (!c || c.post_id !== canonicalFeedPostId) {
        return NextResponse.json({ ok: false, error: "댓글을 찾을 수 없거나 게시글과 맞지 않습니다." }, { status: 400 });
      }
      commentAuthor = normUid(c.user_id);
    } else {
      const { data: cRow } = await sbAny.from("comments").select("id, post_id, user_id").eq("id", commentId).maybeSingle();
      const c = cRow as { id?: string; post_id?: string; user_id?: string } | null;
      if (!c || c.post_id !== postId) {
        return NextResponse.json({ ok: false, error: "댓글을 찾을 수 없거나 게시글과 맞지 않습니다." }, { status: 400 });
      }
      commentAuthor = normUid(c.user_id);
    }
    if (!commentAuthor) {
      return NextResponse.json({ ok: false, error: "댓글 작성자 정보가 없습니다." }, { status: 400 });
    }
    const pair = new Set([requesterId, peerUserId]);
    if (pair.size !== 2 || !pair.has(postAuthor) || !pair.has(commentAuthor)) {
      return NextResponse.json(
        { ok: false, error: "참여자는 게시글 작성자와 댓글 작성자만 가능합니다." },
        { status: 403 }
      );
    }
  } else {
    if (requesterId === postAuthor) {
      return NextResponse.json(
        { ok: false, error: "작성자가 상대에게 문의할 때는 댓글 맥락(commentId)이 필요합니다." },
        { status: 400 }
      );
    }
    if (peerUserId !== postAuthor) {
      return NextResponse.json(
        { ok: false, error: "게시글 작성자에게만 문의할 수 있습니다." },
        { status: 403 }
      );
    }
  }

  const { data: block1 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", requesterId)
    .eq("blocked_user_id", peerUserId)
    .maybeSingle();
  const { data: block2 } = await sbAny
    .from("user_blocks")
    .select("id")
    .eq("user_id", peerUserId)
    .eq("blocked_user_id", requesterId)
    .maybeSingle();
  if (block1 || block2) {
    return NextResponse.json({ ok: false, error: "차단 관계에서는 채팅할 수 없습니다." }, { status: 403 });
  }

  const ctx = commentId ? "comment" : "post";
  const exQ = (a: string, b: string) => {
    let q = sbAny
      .from("chat_rooms")
      .select("id, request_status")
      .eq("room_type", "community")
      .eq("initiator_id", a)
      .eq("peer_id", b);
    if (useFeedRoom) {
      q = q.eq("related_community_post_id", canonicalFeedPostId).is("related_post_id", null);
    } else {
      q = q.eq("related_post_id", postId).is("related_community_post_id", null);
    }
    q = commentId ? q.eq("related_comment_id", commentId) : q.is("related_comment_id", null);
    return q.maybeSingle();
  };
  const { data: ex1 } = await exQ(requesterId, peerUserId);
  const { data: ex2 } = await exQ(peerUserId, requesterId);
  const existingId =
    (ex1 && typeof (ex1 as { id?: string }).id === "string" ? (ex1 as { id: string }).id : null) ??
    (ex2 && typeof (ex2 as { id?: string }).id === "string" ? (ex2 as { id: string }).id : null);
  if (existingId) {
    return NextResponse.json({ ok: true, roomId: existingId, created: false });
  }

   
  const db = sbAny as any;
  const insertRow = useFeedRoom
    ? {
        room_type: "community",
        context_type: ctx,
        related_post_id: null,
        related_community_post_id: canonicalFeedPostId,
        related_comment_id: commentId || null,
        initiator_id: requesterId,
        peer_id: peerUserId,
        request_status: "approved",
        participants_count: 2,
      }
    : {
        room_type: "community",
        context_type: ctx,
        related_post_id: postId,
        related_community_post_id: null,
        related_comment_id: commentId || null,
        initiator_id: requesterId,
        peer_id: peerUserId,
        request_status: "approved",
        participants_count: 2,
      };

  const { data: newRoom, error: roomErr } = await db.from("chat_rooms").insert(insertRow).select("id").single();

  const newId = newRoom && typeof (newRoom as { id?: string }).id === "string" ? (newRoom as { id: string }).id : null;
  if (roomErr || !newId) {
    return NextResponse.json(
      { ok: false, error: roomErr?.message ?? "채팅방 생성에 실패했습니다." },
      { status: 500 }
    );
  }
  const roomId = newId;

  await db.from("chat_room_participants").insert([
    { room_id: roomId, user_id: requesterId, role_in_room: "requester", is_active: true, hidden: false },
    { room_id: roomId, user_id: peerUserId, role_in_room: "responder", is_active: true, hidden: false },
  ]);

  await db.from("chat_messages").insert({
    room_id: roomId,
    sender_id: null,
    message_type: "system",
    body: "게시글 문의 채팅이 시작되었습니다.",
  });

  return NextResponse.json({ ok: true, roomId, created: true });
}
