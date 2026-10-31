"use client";

import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import {
  extractImageUrlsFromInterleavedContent,
  hasInterleavedMarkdownImageSyntax,
} from "@/lib/philife/interleaved-body-markdown";
import { NeighborhoodInterleavedContent } from "@/components/community/NeighborhoodInterleavedContent";
import { ImportedRichContent } from "@/components/community/post-detail/ImportedRichContent";
import { richBlocksImageUrls } from "@/lib/community/imported-content-blocks";
import { MeetingCard } from "@/components/community/MeetingCard";
import type { NeighborhoodFeedPostDTO, NeighborhoodMeetingDetailDTO } from "@/lib/neighborhood/types";
import { CM_BODY_CLASS, CM_TITLE_CLASS } from "@/lib/community/community-ui-classes";
import { PostImageGrid } from "@/components/community/post-detail/PostImageGrid";
import { usePostImageViewer } from "@/components/common/media/PostImageViewer";
import { communityViewerDisplayUrl } from "@/lib/community/post-image-display";
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
  /** 서식 본문: 가져온 글 원문 구조 + 회원 서식 글(Owner 승인 ①). 모임 글은 평문 */
  const richBlocks = !meeting && post.content_blocks?.length ? post.content_blocks : null;
  const richBodyImageUrls = richBlocks ? new Set(richBlocksImageUrls(richBlocks)) : null;
  const isInterleavedBody = !meeting && !richBlocks && hasInterleavedMarkdownImageSyntax(post.content);
  /**
   * 교차 본문(native)이어도 본문에 없는 사진(구 첨부 줄)은 아래 갤러리로 보여 준다 — 사진 누락 방지 (CM-P1-02).
   * imported 교차 본문은 기존 정책(갤러리 숨김) 유지.
   */
  const bodyImageUrls = isInterleavedBody ? new Set(extractImageUrlsFromInterleavedContent(post.content)) : null;
  /** 본문(서식 블록·교차 본문)에 넣은 사진은 그 자리에서, 나머지 첨부 사진만 아래 격자로 — 한 사진은 한 곳에만 */
  const galleryUrls = richBlocks
    ? post.origin_kind === "imported"
      ? []
      : post.images.filter((u) => Boolean(u) && !richBodyImageUrls?.has(u))
    : !isInterleavedBody
      ? post.images.filter(Boolean)
      : post.origin_kind === "imported"
        ? []
        : post.images.filter((u) => Boolean(u) && !bodyImageUrls?.has(u));
  const showImageGallery = galleryUrls.length > 0;
  const { openAt, viewer } = usePostImageViewer({ displayUrlFor: communityViewerDisplayUrl });

  return (
    <div className="mt-4">
      <h1 className={CM_TITLE_CLASS}>{post.title}</h1>
      {meeting ? (
        <div className={CM_BODY_CLASS}>{stripMeetupPostMetaFromContent(post.content)}</div>
      ) : richBlocks ? (
        <ImportedRichContent blocks={richBlocks} />
      ) : isInterleavedBody ? (
        <div className="mt-3">
          <NeighborhoodInterleavedContent content={post.content} />
        </div>
      ) : (
        <PostTextWithVideos text={post.content} className={CM_BODY_CLASS} />
      )}

      {showImageGallery ? (
        <div className="mt-4">
          <PostImageGrid
            urls={galleryUrls}
            onOpen={(i) => openAt(galleryUrls, i)}
            labelFor={(i) => `이미지 ${i + 1} 크게 보기`}
          />
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
