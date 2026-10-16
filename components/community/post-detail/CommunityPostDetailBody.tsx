"use client";

import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { hasInterleavedMarkdownImageSyntax } from "@/lib/philife/interleaved-body-markdown";
import { NeighborhoodInterleavedContent } from "@/components/community/NeighborhoodInterleavedContent";
import { ImportedRichContent } from "@/components/community/post-detail/ImportedRichContent";
import { MeetingCard } from "@/components/community/MeetingCard";
import type { NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { CM_BODY_CLASS, CM_TITLE_CLASS } from "@/lib/community/community-ui-classes";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { usePostImageViewer } from "@/components/common/media/PostImageViewer";
import { PostTextWithVideos } from "@/components/community/post-detail/PostTextWithVideos";

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
  const richBlocks = !meeting && post.origin_kind === "imported" && post.content_blocks?.length ? post.content_blocks : null;
  const isInterleavedBody = !meeting && !richBlocks && hasInterleavedMarkdownImageSyntax(post.content);
  const showImageGallery = !isInterleavedBody && !richBlocks && post.images.length > 0;
  const galleryUrls = showImageGallery ? post.images.filter(Boolean) : [];
  const { openAt, viewer } = usePostImageViewer();

  return (
    <div className="mt-4">
      <h1 className={CM_TITLE_CLASS}>{post.title}</h1>
      {meeting ? (
        <div className={CM_BODY_CLASS}>{stripMeetupPostMetaFromContent(post.content)}</div>
      ) : richBlocks ? (
        <ImportedRichContent blocks={richBlocks} />
      ) : isInterleavedBody ? (
        <div className="mt-3">
          <NeighborhoodInterleavedContent
            content={post.content}
            plainMedia={post.origin_kind === "imported"}
          />
        </div>
      ) : (
        <PostTextWithVideos text={post.content} className={CM_BODY_CLASS} />
      )}

      {showImageGallery ? (
        <div className="mt-4 space-y-2">
          {galleryUrls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => openAt(galleryUrls, i)}
              aria-label={`이미지 ${i + 1} 크게 보기`}
              data-testid="post-body-image"
              className="relative block min-h-[12rem] max-h-[min(70vh,420px)] w-full cursor-zoom-in overflow-hidden rounded-2xl bg-[var(--cm-page-bg)] ring-1 ring-[var(--cm-border)]"
            >
              <SamarketThumbnail
                src={url}
                fill
                roundedClassName="rounded-2xl"
                className="bg-[var(--cm-page-bg)]"
                imageClassName="object-contain"
                priority={i === 0}
              />
            </button>
          ))}
        </div>
      ) : null}
      {viewer}

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
