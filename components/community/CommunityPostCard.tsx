"use client";

import { formatTimeAgo } from "@/lib/utils/format";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { philifeAppPaths } from "@domain/philife/paths";
import { resolveCommunityFeedListThumbnail } from "@/lib/community-feed/feed-list-thumbnail";
import {
  FeedListLayoutCarrotThumbLeft,
  FeedListLayoutCarrotThumbRight,
  FeedListLayoutPlace,
  FeedListLayoutTags,
  FeedListLayoutTextOnly,
  type FeedListCardViewModel,
} from "./feed-list-layouts";

function buildCommunityFeedListViewModel(post: CommunityFeedPostDTO): FeedListCardViewModel {
  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at)) ? formatTimeAgo(post.created_at, "ko-KR") : "";
  const skin = post.feed_list_skin;
  const thumbnailUrl = resolveCommunityFeedListThumbnail(post);
  const contentForTags = post.is_meetup ? stripMeetupPostMetaFromContent(post.content) : post.content;
  const placeLineRaw =
    skin === "location_pin" ? post.meetup_place?.trim() || post.region_label?.trim() || "" : "";
  const hashtagTags = skin === "hashtags_below" ? extractHashtagPreview(`${post.title}\n${contentForTags}`, 3) : [];

  return {
    href: philifeAppPaths.post(post.id),
    topicLabel: post.topic_name,
    topicColor: post.topic_color,
    title: post.title?.trim() || "제목 없음",
    summary: (post.summary ?? "").trim(),
    timeLabel: time,
    authorName: post.author_name,
    secondaryMeta: post.region_label?.trim() ?? "",
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

export function CommunityPostCard({ post }: { post: CommunityFeedPostDTO }) {
  const skin = post.feed_list_skin;
  const vm = buildCommunityFeedListViewModel(post);
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
