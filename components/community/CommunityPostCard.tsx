"use client";

import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";
import { formatTimeAgo } from "@/lib/utils/format";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";
import { philifeAppPaths } from "@domain/philife/paths";
import { resolveCommunityFeedListThumbnail } from "@/lib/community-feed/feed-list-thumbnail";
import { stripMarkdownImageSyntaxForFeedPreview } from "@/lib/philife/interleaved-body-markdown";
import {
  FeedListLayoutCarrotThumbLeft,
  FeedListLayoutCarrotThumbRight,
  FeedListLayoutPlace,
  FeedListLayoutTags,
  FeedListLayoutTextOnly,
  type FeedListCardViewModel,
} from "./feed-list-layouts";

function buildCommunityFeedListViewModel(
  post: CommunityFeedPostDTO,
  noTitleLabel: string,
  lang: AppLanguageCode
): FeedListCardViewModel {
  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at)) ? formatTimeAgo(post.created_at, lang) : "";
  const skin = post.feed_list_skin;
  const thumbnailUrl = resolveCommunityFeedListThumbnail(post);
  const previewSource = (post.summary ?? "").trim() || post.content;
  const contentForTags = stripMarkdownImageSyntaxForFeedPreview(
    post.is_meetup ? stripMeetupPostMetaFromContent(previewSource) : previewSource,
  );
  const placeLineRaw =
    skin === "location_pin" ? post.meetup_place?.trim() || post.region_label?.trim() || "" : "";
  const hashtagTags = skin === "hashtags_below" ? extractHashtagPreview(`${post.title}\n${contentForTags}`, 3) : [];

  /** 섹션 피드 DTO에는 `images` 배열이 없고 `thumbnail_url`만 있으므로 다중 이미지 뱃지는 1(썸 있음)/0. */
  const imageCount = thumbnailUrl ? 1 : 0;

  return {
    href: philifeAppPaths.post(post.id),
    topicLabel: resolveCommunityTopicUILabel(lang, post.topic_name, post.topic_name_en, post.topic_slug),
    topicColor: post.topic_color,
    title: post.title?.trim() || noTitleLabel,
    summary: stripMarkdownImageSyntaxForFeedPreview((post.summary ?? "").trim() || (post.content ?? "")),
    timeLabel: time,
    authorName: post.author_name,
    secondaryMeta: post.region_label?.trim() ?? "",
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

function isSameCommunityPostCard(prev: CommunityFeedPostDTO, next: CommunityFeedPostDTO): boolean {
  if (prev === next) return true;
  return (
    prev.id === next.id &&
    prev.feed_list_skin === next.feed_list_skin &&
    prev.created_at === next.created_at &&
    prev.title === next.title &&
    prev.summary === next.summary &&
    prev.content === next.content &&
    prev.author_name === next.author_name &&
    prev.topic_slug === next.topic_slug &&
    prev.topic_name === next.topic_name &&
    prev.topic_name_en === next.topic_name_en &&
    prev.topic_color === next.topic_color &&
    prev.region_label === next.region_label &&
    prev.meetup_place === next.meetup_place &&
    prev.like_count === next.like_count &&
    prev.comment_count === next.comment_count &&
    prev.view_count === next.view_count &&
    prev.is_question === next.is_question &&
    prev.is_meetup === next.is_meetup &&
    prev.thumbnail_url === next.thumbnail_url
  );
}

export const CommunityPostCard = memo(function CommunityPostCard({ post }: { post: CommunityFeedPostDTO }) {
  const { t, language } = useI18n();
  const skin = post.feed_list_skin;
  const vm = buildCommunityFeedListViewModel(post, t("community_no_title"), language);
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
}, (prev, next) => isSameCommunityPostCard(prev.post, next.post));
