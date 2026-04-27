"use client";

import { memo } from "react";
import { philifeAppPaths } from "@domain/philife/paths";
import { formatTimeAgo } from "@/lib/utils/format";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { resolveNeighborhoodFeedListThumbnail } from "@/lib/community-feed/feed-list-thumbnail";
import { stripMarkdownImageSyntaxForFeedPreview } from "@/lib/philife/interleaved-body-markdown";
import {
  FeedListLayoutCarrotThumbLeft,
  FeedListLayoutCarrotThumbRight,
  FeedListLayoutPlace,
  FeedListLayoutTags,
  FeedListLayoutTextOnly,
  normalizeFeedListBodyPreview,
  type FeedListCardViewModel,
} from "./feed-list-layouts";

function buildNeighborhoodFeedListViewModel(post: NeighborhoodFeedPostDTO): FeedListCardViewModel {
  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at, "ko-KR")
      : "";
  const skin = post.feed_list_skin;
  const thumbnailUrl = resolveNeighborhoodFeedListThumbnail(post);
  const previewSource = (post.summary ?? "").trim() || post.content;
  const contentForTags = stripMarkdownImageSyntaxForFeedPreview(
    post.is_meetup ? stripMeetupPostMetaFromContent(previewSource) : previewSource,
  );
  const placeLineRaw =
    skin === "location_pin" ? post.meetup_place?.trim() || post.location_label?.trim() || "" : "";
  const hashtagTags = skin === "hashtags_below" ? extractHashtagPreview(`${post.title}\n${contentForTags}`, 3) : [];
  const summaryBase = (post.summary ?? "").trim() || (post.content ?? "");
  const summaryForList = post.is_meetup ? stripMeetupPostMetaFromContent(summaryBase) : summaryBase;
  const imageUrls = Array.isArray(post.images) ? post.images.filter((u) => (u ?? "").trim()) : [];
  const imageCount = imageUrls.length;

  const messengerRoom = post.community_messenger_room_id?.trim() ?? "";
  return {
    href: messengerRoom
      ? `/community-messenger/rooms/${encodeURIComponent(messengerRoom)}`
      : post.is_meetup && post.meeting_id
        ? philifeAppPaths.meeting(post.meeting_id)
        : philifeAppPaths.post(post.id),
    meetupMeetingId: post.is_meetup && post.meeting_id ? post.meeting_id : null,
    topicLabel: post.category_label,
    topicColor: post.topic_color,
    title: post.title?.trim() || "제목 없음",
    summary: normalizeFeedListBodyPreview(summaryForList),
    timeLabel: time,
    authorName: post.author_name,
    secondaryMeta: post.location_label?.trim() ?? "",
    likeCount: post.like_count,
    commentCount: post.comment_count,
    viewCount: post.view_count,
    isQuestion: post.is_question,
    isMeetup: post.is_meetup,
    thumbnailUrl,
    imageCount,
    placeLine: placeLineRaw ? placeLineRaw : null,
    hashtagTags,
  };
}

function isSameCommunityCardPost(prev: NeighborhoodFeedPostDTO, next: NeighborhoodFeedPostDTO): boolean {
  if (prev === next) return true;
  return (
    prev.id === next.id &&
    prev.feed_list_skin === next.feed_list_skin &&
    prev.created_at === next.created_at &&
    prev.title === next.title &&
    prev.summary === next.summary &&
    prev.content === next.content &&
    prev.author_name === next.author_name &&
    prev.category_label === next.category_label &&
    prev.topic_color === next.topic_color &&
    prev.location_label === next.location_label &&
    prev.meetup_place === next.meetup_place &&
    prev.community_messenger_room_id === next.community_messenger_room_id &&
    prev.meeting_id === next.meeting_id &&
    prev.like_count === next.like_count &&
    prev.comment_count === next.comment_count &&
    prev.view_count === next.view_count &&
    prev.is_question === next.is_question &&
    prev.is_meetup === next.is_meetup &&
    (prev.images?.length ?? 0) === (next.images?.length ?? 0)
  );
}

export const CommunityCard = memo(function CommunityCard({ post }: { post: NeighborhoodFeedPostDTO }) {
  const skin = post.feed_list_skin;
  const vm = buildNeighborhoodFeedListViewModel(post);
  const hasThumb = Boolean(vm.thumbnailUrl);
  /** `text_primary` 는 일반 주제용 「썸네일 숨김」— 모임은 `meetings.cover`·`images` 로 썸네일이 있으면 우선 표시 */
  const useTextOnlySkin = skin === "text_primary" && !(post.is_meetup && hasThumb);

  if (useTextOnlySkin) {
    return <FeedListLayoutTextOnly vm={vm} />;
  }
  if (skin === "location_pin") {
    return <FeedListLayoutPlace vm={vm} thumbColumn={hasThumb ? "right" : "none"} />;
  }
  if (skin === "hashtags_below") {
    return <FeedListLayoutTags vm={vm} thumbColumn={hasThumb ? "right" : "none"} />;
  }
  if (skin === "compact_media_left") {
    if (!hasThumb) return <FeedListLayoutTextOnly vm={vm} />;
    return <FeedListLayoutCarrotThumbLeft vm={vm} />;
  }
  if (!hasThumb) return <FeedListLayoutTextOnly vm={vm} />;
  return <FeedListLayoutCarrotThumbRight vm={vm} />;
}, (prev, next) => isSameCommunityCardPost(prev.post, next.post));
