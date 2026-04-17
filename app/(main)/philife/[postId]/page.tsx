import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId } from "@/lib/auth/same-user-id";
import { Detail } from "@/components/community/Detail";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  getMeetingDetail,
  getNeighborhoodPostDetail,
  isNeighborhoodMeetingId,
  isViewerJoinedNeighborhoodMeeting,
  listNeighborhoodComments,
} from "@/lib/neighborhood/queries";
import { philifeAppPaths } from "@/lib/philife/paths";
import { isUuidString } from "@/lib/shared/uuid-string";

interface Props {
  params: Promise<{ postId: string }>;
}

async function PhilifeNeighborhoodPostPageBody({ paramsPromise }: { paramsPromise: Props["params"] }) {
  const { postId } = await paramsPromise;
  const seg = postId?.trim() ?? "";
  if (!seg) redirect("/philife");

  if (!isUuidString(seg)) {
    redirect("/philife");
  }

  const [viewerId, canonical] = await Promise.all([
    getOptionalAuthenticatedUserId(),
    resolveCanonicalCommunityPostId(seg),
  ]);
  if (!canonical) {
    if (await isNeighborhoodMeetingId(seg)) {
      redirect(philifeAppPaths.meeting(seg));
    }
    notFound();
  }
  if (canonical !== seg) {
    redirect(`/philife/${canonical}`);
  }

  const postPromise = getNeighborhoodPostDetail(canonical, { viewerUserId: viewerId });
  const commentsPromise = listNeighborhoodComments(canonical, viewerId);
  const [post, initialComments] = await Promise.all([postPromise, commentsPromise]);
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

  if (post.meeting_id && viewerJoinedMeeting) {
    redirect(philifeAppPaths.meeting(post.meeting_id));
  }

  return (
    <Detail
      post={post}
      meeting={meeting}
      initialComments={initialComments}
      initialCommentsLoaded
      viewerJoinedMeeting={viewerJoinedMeeting}
    />
  );
}

/** /philife/:postId — 필라이프 글 상세 (UUID). 게시판 slug 미사용. */
export default function PhilifeNeighborhoodPostPage({ params }: Props) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeNeighborhoodPostPageBody paramsPromise={params} />
    </Suspense>
  );
}
