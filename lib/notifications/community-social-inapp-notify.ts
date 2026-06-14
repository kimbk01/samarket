import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const POST_HREF = (postId: string) => `/philife/posts/${encodeURIComponent(postId)}`;

export async function notifyCommunityPostCommentReceived(
  sb: SupabaseClient<any>,
  args: {
    postId: string;
    postAuthorUserId: string;
    commenterUserId: string;
    commentPreview: string;
    parentCommentAuthorUserId?: string | null;
  }
): Promise<void> {
  const postId = trimText(args.postId);
  const postAuthorId = trimText(args.postAuthorUserId);
  const commenterId = trimText(args.commenterUserId);
  if (!postId || !postAuthorId || !commenterId) return;

  const nickMap = await fetchNicknamesForUserIds(sb, [commenterId]);
  const commenterLabel = nickMap.get(commenterId)?.trim() || notifySafeT("ko", "notify_peer_fallback");
  const preview = args.commentPreview.slice(0, 200);
  const linkUrl = POST_HREF(postId);

  const recipients = new Set<string>();
  if (postAuthorId !== commenterId) recipients.add(postAuthorId);
  const parentAuthor = trimText(args.parentCommentAuthorUserId);
  if (parentAuthor && parentAuthor !== commenterId) recipients.add(parentAuthor);

  for (const uid of recipients) {
    const language = await loadNotificationUserLanguage(sb, uid);
    const isReply = parentAuthor === uid && parentAuthor !== postAuthorId;
    const title = isReply
      ? notifySafeT(language, "notify_community_reply_title")
      : notifySafeT(language, "notify_community_comment_title");
    const body =
      preview ||
      notifySafeT(language, "notify_community_comment_body", {
        vars: { name: commenterLabel },
      });

    await appendUserNotification(sb, {
      user_id: uid,
      notification_type: "report",
      title,
      body,
      link_url: linkUrl,
      domain: "community_chat",
      ref_id: postId,
      push_kind: "community",
      meta: {
        kind: "community_comment",
        post_id: postId,
        commenter_id: commenterId,
        commenter_label: commenterLabel,
      },
    });
  }
}

export async function notifyCommunityPostLikeReceived(
  sb: SupabaseClient<any>,
  args: {
    postId: string;
    postAuthorUserId: string;
    likerUserId: string;
  }
): Promise<void> {
  const postId = trimText(args.postId);
  const postAuthorId = trimText(args.postAuthorUserId);
  const likerId = trimText(args.likerUserId);
  if (!postId || !postAuthorId || !likerId || postAuthorId === likerId) return;

  const nickMap = await fetchNicknamesForUserIds(sb, [likerId]);
  const likerLabel = nickMap.get(likerId)?.trim() || notifySafeT("ko", "notify_peer_fallback");
  const language = await loadNotificationUserLanguage(sb, postAuthorId);

  await appendUserNotification(sb, {
    user_id: postAuthorId,
    notification_type: "report",
    title: notifySafeT(language, "notify_community_like_title"),
    body: notifySafeT(language, "notify_community_like_body", { vars: { name: likerLabel } }),
    link_url: POST_HREF(postId),
    domain: "community_chat",
    ref_id: postId,
    push_kind: "community",
    meta: {
      kind: "community_like",
      post_id: postId,
      liker_id: likerId,
      liker_label: likerLabel,
    },
  });
}
