import Link from "next/link";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId } from "@/lib/auth/same-user-id";
import { Detail } from "@/components/community/Detail";
import { CommunityPostAccessScreen } from "@/components/community/share/CommunityPostAccessScreen";
import {
  getMeetingDetail,
  isViewerJoinedNeighborhoodMeeting,
} from "@/lib/neighborhood/queries";
import { resolveCommunityPostDetailAccess } from "@/lib/community/share/community-post-access";
import { philifeAppPaths } from "@/lib/philife/paths";
import { isUuidString } from "@/lib/shared/uuid-string";

type Props = {
  postId: string;
};

export async function CommunityPostDetailPageBody({ postId }: Props) {
  const seg = postId?.trim() ?? "";
  if (!seg || !isUuidString(seg)) notFound();

  const viewerId = await getOptionalAuthenticatedUserId();
  const access = await resolveCommunityPostDetailAccess(seg, viewerId);

  if (access.reason !== "ok" || !access.post) {
    return (
      <CommunityPostAccessScreen
        reason={access.reason}
        canonicalPath={`/community/posts/${encodeURIComponent(seg)}`}
      />
    );
  }

  const post = access.post;
  const t0 = performance.now();

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

  return (
    <Detail
      post={post}
      meeting={meeting}
      viewerJoinedMeeting={viewerJoinedMeeting}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
      similarPosts={[]}
    />
  );
}

export function CommunityPostDetailBackLink() {
  return (
    <Link href={philifeAppPaths.home} className="text-[var(--cm-primary)] underline">
      {/* i18n via parent if needed */}
    </Link>
  );
}
