"use client";

import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils/format";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";

function TopicRow({ post }: { post: CommunityFeedPostDTO }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
        style={{ backgroundColor: post.topic_color ?? "#64748b" }}
      >
        {post.topic_name}
      </span>
      {post.is_question ? (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">질문</span>
      ) : null}
      {post.is_meetup ? (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">모임</span>
      ) : null}
    </div>
  );
}

function MetaFooter({ post, time }: { post: CommunityFeedPostDTO; time: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
      {post.region_label ? <span>{post.region_label}</span> : null}
      {post.region_label ? <span aria-hidden>·</span> : null}
      <span>{time}</span>
      <span aria-hidden>·</span>
      <span>조회 {post.view_count}</span>
      <span aria-hidden>·</span>
      <span>댓글 {post.comment_count}</span>
      <span aria-hidden>·</span>
      <span>공감 {post.like_count}</span>
    </div>
  );
}

export function CommunityPostCard({ post }: { post: CommunityFeedPostDTO }) {
  const href = `/community/post/${post.id}`;
  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at)) ? formatTimeAgo(post.created_at, "ko-KR") : "";
  const skin = post.feed_list_skin;

  const showThumb = skin !== "text_primary" && Boolean(post.thumbnail_url);
  const summaryClamp = skin === "text_primary" ? "line-clamp-4" : "line-clamp-2";
  const placeLine =
    skin === "location_pin" ? (post.meetup_place?.trim() || post.region_label?.trim() || "") : "";
  const tags = skin === "hashtags_below" ? extractHashtagPreview(`${post.title}\n${post.content}`, 6) : [];

  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:border-gray-200"
    >
      <div className="flex gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <TopicRow post={post} />
            <span className="shrink-0 text-[18px] leading-none text-gray-300" aria-hidden>
              ⋯
            </span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">{post.title}</h3>
          {placeLine ? (
            <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-gray-700">
              <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{placeLine}</span>
            </p>
          ) : null}
          {tags.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((h) => (
                <span key={h} className="text-[12px] font-medium text-sky-700">
                  {h}
                </span>
              ))}
            </div>
          ) : null}
          <p className={`mt-1 text-[13px] leading-relaxed text-gray-600 ${summaryClamp}`}>{post.summary}</p>
          <MetaFooter post={post} time={time} />
        </div>
        {showThumb && post.thumbnail_url ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            { }
            <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
