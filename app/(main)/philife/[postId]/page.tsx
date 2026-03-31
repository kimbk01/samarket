import { notFound, redirect } from "next/navigation";
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

/** /philife/:postId — 필라이프 글 상세 (UUID만). 게시판 slug 미사용. */
export default async function PhilifeNeighborhoodPostPage({ params }: Props) {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!seg) redirect("/philife");

  if (!isUuidString(seg)) {
    redirect("/philife");
  }

  const canonical = await resolveCanonicalCommunityPostId(seg);
  if (!canonical) {
    if (await isNeighborhoodMeetingId(seg)) {
      redirect(philifeAppPaths.meetingOpenChat(seg));
    }
    notFound();
  }
  if (canonical !== seg) {
    redirect(`/philife/${canonical}`);
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const post = await getNeighborhoodPostDetail(canonical, { viewerUserId: viewerId });
  if (!post) {
    notFound();
  }

  const [comments, meeting] = await Promise.all([
    listNeighborhoodComments(canonical, viewerId),
    post.meeting_id ? getMeetingDetail(post.meeting_id) : Promise.resolve(null),
  ]);

  let viewerJoinedMeeting = false;
  if (post.meeting_id && viewerId && meeting) {
    viewerJoinedMeeting =
      isSameUserId(viewerId, meeting.host_user_id) ||
      isSameUserId(viewerId, meeting.created_by) ||
      isSameUserId(viewerId, post.author_id) ||
      (await isViewerJoinedNeighborhoodMeeting(post.meeting_id, viewerId));
  }

  /** 개설자·승인 멤버는 글 상세를 건너뛰고 오픈채팅(채팅 화면)으로 */
  if (post.meeting_id && viewerJoinedMeeting) {
    redirect(philifeAppPaths.meetingOpenChat(post.meeting_id));
  }

  return (
    <Detail
      post={post}
      meeting={meeting}
      initialComments={comments}
      viewerJoinedMeeting={viewerJoinedMeeting}
    />
  );
}
