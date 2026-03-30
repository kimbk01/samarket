"use client";

import Link from "next/link";
import type { FeedListThumbColumn } from "@/lib/community-feed/topic-feed-skin";

export type FeedListCardViewModel = {
  href: string;
  topicLabel: string;
  topicColor: string | null;
  title: string;
  summary: string;
  timeLabel: string;
  authorName: string;
  secondaryMeta: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isQuestion: boolean;
  isMeetup: boolean;
  thumbnailUrl: string | null;
  /** location_pin: 핀 라인 (없으면 null → 일반 메타) */
  placeLine: string | null;
  /** hashtags_below: 최대 3개 */
  hashtagTags: string[];
};

function TopicBadge({ label, color }: { label: string; color: string | null }) {
  const style = color ? { backgroundColor: `${color}18`, color } : undefined;
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-neutral-700"
      style={style}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function Badges({ isQuestion, isMeetup }: { isQuestion: boolean; isMeetup: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {isQuestion ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">질문</span>
      ) : null}
      {isMeetup ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">오픈채팅</span>
      ) : null}
    </span>
  );
}

function Thumbnail92({ url }: { url: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      className="h-[92px] w-[92px] shrink-0 rounded-xl object-cover"
      loading="lazy"
    />
  );
}

function MetaLine({
  timeLabel,
  authorName,
  secondaryMeta,
  likeCount,
  commentCount,
  viewCount,
}: Pick<
  FeedListCardViewModel,
  "timeLabel" | "authorName" | "secondaryMeta" | "likeCount" | "commentCount" | "viewCount"
>) {
  const parts: string[] = [];
  if (authorName.trim()) parts.push(authorName.trim());
  if (secondaryMeta.trim()) parts.push(secondaryMeta.trim());
  parts.push(timeLabel);
  const stats: string[] = [];
  if (likeCount > 0) stats.push(`좋아요 ${likeCount}`);
  if (commentCount > 0) stats.push(`댓글 ${commentCount}`);
  if (viewCount > 0) stats.push(`조회 ${viewCount}`);
  const meta = parts.join(" · ");
  const statStr = stats.length ? stats.join(" · ") : "";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-4 text-neutral-500">
      <span className="min-w-0">{meta}</span>
      {statStr ? <span className="text-neutral-400">{statStr}</span> : null}
    </div>
  );
}

function CardShell({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <Link
        href={href}
        className="block px-4 py-3 transition-colors hover:bg-neutral-50/60 active:bg-neutral-100/80"
      >
        {children}
      </Link>
    </article>
  );
}

/** 당근형 우측 썸네일 (썸네일 없으면 사용하지 않음 — 텍스트 전용으로 분기) */
export function FeedListLayoutCarrotThumbRight({ vm }: { vm: FeedListCardViewModel }) {
  const url = vm.thumbnailUrl;
  return (
    <CardShell href={vm.href}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
            <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-neutral-900">{vm.title}</h3>
          {vm.summary.trim() ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-neutral-600">{vm.summary}</p>
          ) : null}
          <MetaLine
            timeLabel={vm.timeLabel}
            authorName={vm.authorName}
            secondaryMeta={vm.secondaryMeta}
            likeCount={vm.likeCount}
            commentCount={vm.commentCount}
            viewCount={vm.viewCount}
          />
        </div>
        {url ? <Thumbnail92 url={url} /> : null}
      </div>
    </CardShell>
  );
}

/** 당근형 좌측 썸네일 */
export function FeedListLayoutCarrotThumbLeft({ vm }: { vm: FeedListCardViewModel }) {
  const url = vm.thumbnailUrl;
  return (
    <CardShell href={vm.href}>
      <div className="flex items-start gap-3">
        {url ? <Thumbnail92 url={url} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
            <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-neutral-900">{vm.title}</h3>
          {vm.summary.trim() ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-neutral-600">{vm.summary}</p>
          ) : null}
          <MetaLine
            timeLabel={vm.timeLabel}
            authorName={vm.authorName}
            secondaryMeta={vm.secondaryMeta}
            likeCount={vm.likeCount}
            commentCount={vm.commentCount}
            viewCount={vm.viewCount}
          />
        </div>
      </div>
    </CardShell>
  );
}

/** 텍스트 중심 / 썸네일 없음 fallback */
export function FeedListLayoutTextOnly({ vm }: { vm: FeedListCardViewModel }) {
  return (
    <CardShell href={vm.href}>
      <div className="min-w-0 w-full">
        <div className="flex flex-wrap items-center gap-2">
          <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
          <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-neutral-900">{vm.title}</h3>
        {vm.summary.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-neutral-600">{vm.summary}</p>
        ) : null}
        <MetaLine
          timeLabel={vm.timeLabel}
          authorName={vm.authorName}
          secondaryMeta={vm.secondaryMeta}
          likeCount={vm.likeCount}
          commentCount={vm.commentCount}
          viewCount={vm.viewCount}
        />
      </div>
    </CardShell>
  );
}

function PinPlaceLine({ text }: { text: string }) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-5 text-neutral-800">
      <span className="shrink-0 text-base" aria-hidden>
        📍
      </span>
      <span className="truncate">{text}</span>
    </div>
  );
}

/** 장소 강조: 장소 없으면 일반 메타만 (placeLine null 시 secondaryMeta로 충분) */
export function FeedListLayoutPlace({ vm, thumbColumn }: { vm: FeedListCardViewModel; thumbColumn: FeedListThumbColumn }) {
  const place = vm.placeLine?.trim() ?? "";
  const showPin = Boolean(place);
  const url = vm.thumbnailUrl;

  const textBlock = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
        <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
      </div>
      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-neutral-900">{vm.title}</h3>
      {showPin ? <PinPlaceLine text={place} /> : null}
      {vm.summary.trim() ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-neutral-600">{vm.summary}</p>
      ) : null}
      <MetaLine
        timeLabel={vm.timeLabel}
        authorName={vm.authorName}
        secondaryMeta={vm.secondaryMeta}
        likeCount={vm.likeCount}
        commentCount={vm.commentCount}
        viewCount={vm.viewCount}
      />
    </div>
  );

  if (thumbColumn === "left" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="flex items-start gap-3">
          <Thumbnail92 url={url} />
          {textBlock}
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="flex items-start gap-3">
          {textBlock}
          <Thumbnail92 url={url} />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href}>
      <div className="min-w-0 w-full">{textBlock}</div>
    </CardShell>
  );
}

/** 태그 줄: 태그 없으면 줄 숨김 */
export function FeedListLayoutTags({ vm, thumbColumn }: { vm: FeedListCardViewModel; thumbColumn: FeedListThumbColumn }) {
  const tags = vm.hashtagTags;
  const showTags = tags.length > 0;
  const url = vm.thumbnailUrl;

  const textBlock = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
        <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
      </div>
      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-neutral-900">{vm.title}</h3>
      {vm.summary.trim() ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-neutral-600">{vm.summary}</p>
      ) : null}
      {showTags ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-medium text-neutral-700"
            >
              {t.startsWith("#") ? t : `#${t}`}
            </span>
          ))}
        </div>
      ) : null}
      <MetaLine
        timeLabel={vm.timeLabel}
        authorName={vm.authorName}
        secondaryMeta={vm.secondaryMeta}
        likeCount={vm.likeCount}
        commentCount={vm.commentCount}
        viewCount={vm.viewCount}
      />
    </div>
  );

  if (thumbColumn === "left" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="flex items-start gap-3">
          <Thumbnail92 url={url} />
          {textBlock}
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="flex items-start gap-3">
          {textBlock}
          <Thumbnail92 url={url} />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href}>
      <div className="min-w-0 w-full">{textBlock}</div>
    </CardShell>
  );
}
