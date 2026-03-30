"use client";

import { philifeAppPaths } from "@domain/philife/paths";
import { formatTimeAgo } from "@/lib/utils/format";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { resolveNeighborhoodFeedListThumbnail } from "@/lib/community-feed/feed-list-thumbnail";
import {
  FeedListLayoutCarrotThumbLeft,
  FeedListLayoutCarrotThumbRight,
  FeedListLayoutPlace,
  FeedListLayoutTags,
  FeedListLayoutTextOnly,
  type FeedListCardViewModel,
} from "./feed-list-layouts";

function buildNeighborhoodFeedListViewModel(post: NeighborhoodFeedPostDTO): FeedListCardViewModel {
  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at, "ko-KR")
      : "";
  const skin = post.feed_list_skin;
  const thumbnailUrl = resolveNeighborhoodFeedListThumbnail(post);
  const contentForTags = post.is_meetup ? stripMeetupPostMetaFromContent(post.content) : post.content;
  const placeLineRaw =
    skin === "location_pin" ? post.meetup_place?.trim() || post.location_label?.trim() || "" : "";
  const hashtagTags = skin === "hashtags_below" ? extractHashtagPreview(`${post.title}\n${contentForTags}`, 3) : [];

  return {
    href: philifeAppPaths.post(post.id),
    topicLabel: post.category_label,
    topicColor: post.topic_color,
    title: post.title?.trim() || "제목 없음",
    summary: (post.summary ?? "").trim(),
    timeLabel: time,
    authorName: post.author_name,
    secondaryMeta: post.location_label?.trim() ?? "",
    likeCount: post.like_count,
    commentCount: post.comment_count,
    viewCount: post.view_count,
    isQuestion: post.is_question,
    isMeetup: post.is_meetup,
    thumbnailUrl,
    placeLine: placeLineRaw ? placeLineRaw : null,
    hashtagTags,
  };
}

export function CommunityCard({ post }: { post: NeighborhoodFeedPostDTO }) {
  const skin = post.feed_list_skin;
  const vm = buildNeighborhoodFeedListViewModel(post);
  const hasThumb = Boolean(vm.thumbnailUrl);

  if (skin === "text_primary") {
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
}
