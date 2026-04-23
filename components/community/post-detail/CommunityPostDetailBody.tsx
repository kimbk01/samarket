"use client";

import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { hasInterleavedMarkdownImageSyntax } from "@/lib/philife/interleaved-body-markdown";
import { NeighborhoodInterleavedContent } from "@/components/community/NeighborhoodInterleavedContent";
import { MeetingCard } from "@/components/community/MeetingCard";
import type { NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { PHILIFE_DETAIL_BODY_CLASS, PHILIFE_DETAIL_TITLE_CLASS } from "@/lib/philife/philife-flat-ui-classes";

type Props = {
  post: NeighborhoodFeedPostDTO;
  meeting: NeighborhoodMeetingDetailDTO | null;
  meetingHostDisplay: string | undefined;
  viewerJoinedMeeting: boolean;
};

export function CommunityPostDetailBody({
  post,
  meeting,
  meetingHostDisplay,
  viewerJoinedMeeting,
}: Props) {
  const isInterleavedBody = !meeting && hasInterleavedMarkdownImageSyntax(post.content);

  return (
    <div className="px-4">
      <h1 className={`${PHILIFE_DETAIL_TITLE_CLASS} mt-1`}>{post.title}</h1>
      {meeting ? (
        <div className={PHILIFE_DETAIL_BODY_CLASS}>{stripMeetupPostMetaFromContent(post.content)}</div>
      ) : isInterleavedBody ? (
        <div className="mt-3">
          <NeighborhoodInterleavedContent content={post.content} />
        </div>
      ) : (
        <div className={PHILIFE_DETAIL_BODY_CLASS}>{post.content}</div>
      )}

      {!isInterleavedBody && post.images.length > 0 ? (
        <div className="mt-4 space-y-2">
          {post.images.map((url, i) =>
            url ? (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-[4px] bg-[#F7F8FA] ring-1 ring-[#E5E7EB]"
              >
                <img
                  src={url}
                  alt=""
                  className="w-full max-h-[min(70vh,420px)] object-contain bg-black/[0.02]"
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              </a>
            ) : null
          )}
        </div>
      ) : null}

      {meeting ? (
        <div className="mt-5">
          <MeetingCard
            meeting={meeting}
            variant="postEmbed"
            hostDisplayName={meetingHostDisplay}
            viewerStatus={viewerJoinedMeeting ? "joined" : null}
          />
        </div>
      ) : null}
    </div>
  );
}
