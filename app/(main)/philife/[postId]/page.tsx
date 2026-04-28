import { notFound, redirect } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId } from "@/lib/auth/same-user-id";
import { Detail } from "@/components/community/Detail";
import {
  getMeetingDetail,
  getNeighborhoodPostDetail,
  isViewerJoinedNeighborhoodMeeting,
} from "@/lib/neighborhood/queries";
import { isUuidString } from "@/lib/shared/uuid-string";

interface Props {
  params: Promise<{ postId: string }>;
}

async function PhilifeNeighborhoodPostPageBody({ paramsPromise }: { paramsPromise: Props["params"] }) {
  const t0 = performance.now();
  const { postId } = await paramsPromise;
  const seg = postId?.trim() ?? "";
  if (!seg) redirect("/philife");

  if (!isUuidString(seg)) {
    redirect("/philife");
  }

  const viewerId = await getOptionalAuthenticatedUserId();

  /**
   * 상세 첫 화면을 막는 블로킹 쿼리를 줄여 즉시 읽기 체감을 우선한다.
   * - `post`만 먼저 로드해 본문을 그린다.
   * - 댓글/유사글은 클라이언트에서 후속 로드(`initialCommentsLoaded=false`, `similarPosts=[]`).
   */
  const post = await getNeighborhoodPostDetail(seg, { viewerUserId: viewerId });
  if (!post) {
    notFound();
  }

  const [meeting, joinedFromDb] = await Promise.all([
    post.meeting_id ? getMeetingDetail(post.meeting_id) : Promise.resolve(null),
    post.meeting_id && viewerId
      ? isViewerJoinedNeighborhoodMeeting(post.meeting_id, viewerId)
      : Promise.resolve(false),
  ]);

  let viewerJoinedMeeting = false;
  if (post.meeting_id && viewerId && meeting) {
    viewerJoinedMeeting =
      isSameUserId(viewerId, meeting.host_user_id) ||
      isSameUserId(viewerId, meeting.created_by) ||
      isSameUserId(viewerId, post.author_id) ||
      joinedFromDb;
  }

  /**
   * 참가자를 `?meetingId=` 로 보내지 않는다.
   * `CommunityFeed` 딥링크는 방이 없을 때 `router.replace(/philife/{post_id})` 로 복귀시키는데,
   * 여기서 다시 `?meetingId=` 로 redirect 하면 **무한 리다이렉트(깜박임)** 가 난다.
   */

  return (
    <Detail
      post={post}
      meeting={meeting}
      initialComments={[]}
      initialCommentsLoaded={false}
      viewerJoinedMeeting={viewerJoinedMeeting}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
      similarPosts={[]}
    />
  );
}

/** /philife/:postId — 필라이프 글 상세 (UUID). 게시판 slug 미사용. */
export default async function PhilifeNeighborhoodPostPage({ params }: Props) {
  return <PhilifeNeighborhoodPostPageBody paramsPromise={params} />;
}
