"use client";

import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { hasInterleavedMarkdownImageSyntax } from "@/lib/philife/interleaved-body-markdown";
import { NeighborhoodInterleavedContent } from "@/components/community/NeighborhoodInterleavedContent";
import { MeetingCard } from "@/components/community/MeetingCard";
import type { NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { CM_BODY_CLASS, CM_TITLE_CLASS } from "@/lib/community/community-ui-classes";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

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
    <div className="mt-4">
      <h1 className={CM_TITLE_CLASS}>{post.title}</h1>
      {meeting ? (
        <div className={CM_BODY_CLASS}>{stripMeetupPostMetaFromContent(post.content)}</div>
      ) : isInterleavedBody ? (
        <div className="mt-3">
          <NeighborhoodInterleavedContent content={post.content} />
        </div>
      ) : (
        <div className={CM_BODY_CLASS}>{post.content}</div>
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
                className="relative block min-h-[12rem] max-h-[min(70vh,420px)] w-full overflow-hidden rounded-2xl bg-[var(--cm-page-bg)] ring-1 ring-[var(--cm-border)]"
              >
                <SamarketThumbnail
                  src={url}
                  fill
                  roundedClassName="rounded-2xl"
                  className="bg-[var(--cm-page-bg)]"
                  imageClassName="object-contain"
                  priority={i === 0}
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
