"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedListThumbColumn } from "@/lib/community-feed/topic-feed-skin";

export type FeedListCardViewModel = {
  href: string;
  /** 모임 글이면 meetingId 가 함께 내려오지만 이동은 글 상세로 통일 */
  meetupMeetingId?: string | null;
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

const FEED_LINK_PREFETCH_TTL_MS = 60_000;
const feedLinkPrefetchedAt = new Map<string, number>();

function TopicBadge({ label, color }: { label: string; color: string | null }) {
  const style = color ? { backgroundColor: `${color}18`, color } : undefined;
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-sam-fg"
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
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">모임</span>
      ) : null}
    </span>
  );
}

function Thumbnail92({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      width={92}
      height={92}
      className="h-[92px] w-[92px] shrink-0 rounded-ui-rect object-cover"
      loading="lazy"
      decoding="async"
      fetchPriority="low"
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
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-4 text-sam-muted">
      <span className="min-w-0">{meta}</span>
      {statStr ? <span className="text-sam-meta">{statStr}</span> : null}
    </div>
  );
}

function CardShell({
  href,
  children,
}: {
  href: string;
  meetupMeetingId?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const prefetchOnIntent = () => {
    const key = href.trim();
    if (!key) return;
    const now = Date.now();
    const prev = feedLinkPrefetchedAt.get(key) ?? 0;
    if (now - prev < FEED_LINK_PREFETCH_TTL_MS) return;
    feedLinkPrefetchedAt.set(key, now);
    router.prefetch(key);
  };

  return (
    <article className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <Link
        href={href}
        prefetch={false}
        onMouseEnter={prefetchOnIntent}
        onTouchStart={prefetchOnIntent}
        onClick={prefetchOnIntent}
        className="block px-4 py-3 transition-colors hover:bg-sam-app/60 active:bg-sam-surface-muted/80"
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
    <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
            <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-sam-fg">{vm.title}</h3>
          {vm.summary.trim() ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-sam-muted">{vm.summary}</p>
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
    <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
      <div className="flex items-start gap-3">
        {url ? <Thumbnail92 url={url} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
            <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-sam-fg">{vm.title}</h3>
          {vm.summary.trim() ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-sam-muted">{vm.summary}</p>
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
    <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
      <div className="min-w-0 w-full">
        <div className="flex flex-wrap items-center gap-2">
          <TopicBadge label={vm.topicLabel} color={vm.topicColor} />
          <Badges isQuestion={vm.isQuestion} isMeetup={vm.isMeetup} />
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-sam-fg">{vm.title}</h3>
        {vm.summary.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-sam-muted">{vm.summary}</p>
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
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-5 text-sam-fg">
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
      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-sam-fg">{vm.title}</h3>
      {showPin ? <PinPlaceLine text={place} /> : null}
      {vm.summary.trim() ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-sam-muted">{vm.summary}</p>
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
      <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
        <div className="flex items-start gap-3">
          <Thumbnail92 url={url} />
          {textBlock}
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
        <div className="flex items-start gap-3">
          {textBlock}
          <Thumbnail92 url={url} />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
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
      <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-sam-fg">{vm.title}</h3>
      {vm.summary.trim() ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-sam-muted">{vm.summary}</p>
      ) : null}
      {showTags ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="max-w-full truncate rounded-full bg-sam-surface-muted px-2 py-0.5 text-[12px] font-medium text-sam-fg"
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
      <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
        <div className="flex items-start gap-3">
          <Thumbnail92 url={url} />
          {textBlock}
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
        <div className="flex items-start gap-3">
          {textBlock}
          <Thumbnail92 url={url} />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href} meetupMeetingId={vm.meetupMeetingId}>
      <div className="min-w-0 w-full">{textBlock}</div>
    </CardShell>
  );
}
