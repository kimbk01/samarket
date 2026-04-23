"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ThumbsUp, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FeedListThumbColumn } from "@/lib/community-feed/topic-feed-skin";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { stripMarkdownImageSyntaxForFeedPreview } from "@/lib/philife/interleaved-body-markdown";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export type FeedListCardViewModel = {
  href: string;
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
  /** 원본 `images` 배열 길이(썸네일 2장+ 오버레이) */
  imageCount: number;
  placeLine: string | null;
  hashtagTags: string[];
};

const FEED_LINK_PREFETCH_TTL_MS = 60_000;
const feedLinkPrefetchedAt = new Map<string, number>();

/** 리스트: HTML 제거·공백 정리·이미지 마크다운 제거 (DB 변경 없음) */
export function normalizeFeedListBodyPreview(raw: string): string {
  if (!raw?.trim()) return "";
  let t = String(raw).replace(/<[^>]+>/g, " ");
  t = stripMarkdownImageSyntaxForFeedPreview(t);
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  t = t.replace(/[\r\n\u2028\u2029\t]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function hasCategoryBadge(
  vm: Pick<FeedListCardViewModel, "topicLabel" | "isQuestion" | "isMeetup">,
) {
  return Boolean((vm.topicLabel ?? "").trim() || vm.isQuestion || vm.isMeetup);
}

function SingleListBadge({ vm }: { vm: Pick<FeedListCardViewModel, "topicLabel" | "topicColor" | "isQuestion" | "isMeetup"> }) {
  const label = (vm.topicLabel ?? "").trim();
  if (label) {
    const c = vm.topicColor?.trim();
    return (
      <span
        className="inline-flex max-w-full shrink-0 items-center rounded-[4px] border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-[11px] font-medium text-[#6B7280]"
        style={c ? { borderColor: `${c}55`, color: c, backgroundColor: `${c}12` } : undefined}
        title={label}
      >
        <span className="truncate">{label}</span>
      </span>
    );
  }
  if (vm.isQuestion) {
    return (
      <span className="shrink-0 rounded-[4px] border border-amber-200/80 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
        질문
      </span>
    );
  }
  if (vm.isMeetup) {
    return (
      <span className="shrink-0 rounded-[4px] border border-emerald-200/80 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-900">
        모임
      </span>
    );
  }
  return null;
}

/** 당근형: 말머리/질문/모임 — 상단 한 줄(제목과 분리) */
function ListCategoryPillRow({ vm }: { vm: FeedListCardViewModel }) {
  if (!hasCategoryBadge(vm)) return null;
  return (
    <div className="mb-1.5 flex w-full min-w-0 items-center">
      <SingleListBadge vm={vm} />
    </div>
  );
}

function ListTitleOnly({ title }: { title: string }) {
  return (
    <h3
      className="min-w-0 truncate text-left text-[15px] font-semibold leading-snug text-[#050505]"
      title={title}
    >
      {title}
    </h3>
  );
}

function ListBodyPreview({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="mt-1 line-clamp-2 text-left text-[13px] font-normal leading-[1.45] text-[#6B7280]">{text}</p>
  );
}

function ListHashtagOne({ tag }: { tag: string | null | undefined }) {
  if (!tag) return null;
  const t = tag.startsWith("#") ? tag : `#${tag}`;
  return (
    <div className="mt-0.5 min-w-0">
      <span className="inline-block max-w-full truncate rounded-[4px] bg-[#F3F0FF] px-2 py-0.5 text-[11px] font-medium text-[#7360F2]">
        {t}
      </span>
    </div>
  );
}

/** 피드 메타: 작성자 강조 + 위치·시간·조회 / 공감·댓글 */
function ListMetaKarrot({
  vm,
  placeInMeta,
  className = "",
}: {
  vm: FeedListCardViewModel;
  placeInMeta: boolean;
  className?: string;
}) {
  const author = (vm.authorName ?? "").trim() || "회원";
  const pl = (vm.placeLine ?? "").trim();
  const sec = (vm.secondaryMeta ?? "").trim();
  const locationPart = placeInMeta && pl ? pl : sec && sec !== author ? sec : "";
  const time = (vm.timeLabel ?? "").trim();

  const titleStr = [author, locationPart, time, `조회 ${vm.viewCount}`].filter(Boolean).join(" · ");

  return (
    <div
      className={["mt-2", "flex w-full min-w-0 items-center justify-between gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="min-w-0 flex-1 truncate text-[12px] font-normal leading-[1.4] text-[#6B7280]" title={titleStr}>
        <span className="font-semibold text-[#1F2430]">{author}</span>
        {locationPart ? <> · {locationPart}</> : null}
        {time ? <> · {time}</> : null}
        <> · </>조회 {vm.viewCount}
      </p>
      <div className="flex shrink-0 items-center gap-3 text-[12px] text-[#6B7280]">
        <span className="inline-flex items-center gap-1 tabular-nums" title="공감">
          <ThumbsUp className="h-4 w-4 shrink-0 text-[#6B7280]" strokeWidth={1.8} />
          {vm.likeCount}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums" title="댓글">
          <MessageCircle className="h-4 w-4 shrink-0 text-[#6B7280]" strokeWidth={1.8} />
          {vm.commentCount}
        </span>
      </div>
    </div>
  );
}

/** 리스트: 72~88px 정사각형 고정(세로형 원본도 object-cover, 메타행과 겹침 방지) */
function ListThumb({ url, totalImages }: { url: string; totalImages: number }) {
  const showMore = totalImages > 1;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0 self-start overflow-hidden rounded-[4px] sm:h-20 sm:w-20 md:h-[88px] md:w-[88px]">
      <img
        src={url}
        alt=""
        className="block h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
      {showMore ? (
        <span
          className="absolute left-0.5 top-0.5 min-w-[1.125rem] rounded-[4px] bg-black/65 px-1 text-center text-[10px] font-medium leading-tight text-white"
          aria-label={`이미지 ${totalImages}장`}
        >
          {totalImages > 9 ? "9+" : totalImages}
        </span>
      ) : null}
    </div>
  );
}

function ListTextStack({
  vm,
  firstHashtag,
  placeInMeta,
  trailingAside,
}: {
  vm: FeedListCardViewModel;
  firstHashtag: string | null;
  placeInMeta: boolean;
  trailingAside?: ReactNode;
}) {
  if (trailingAside) {
    return (
      <>
        <ListCategoryPillRow vm={vm} />
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <ListTitleOnly title={vm.title} />
            <ListBodyPreview text={vm.summary} />
            {firstHashtag ? <ListHashtagOne tag={firstHashtag} /> : null}
          </div>
          {trailingAside}
        </div>
        <ListMetaKarrot vm={vm} placeInMeta={placeInMeta} className="!mt-2" />
      </>
    );
  }
  return (
    <>
      <ListCategoryPillRow vm={vm} />
      <div className="flex min-w-0 items-stretch gap-2.5 sm:gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ListTitleOnly title={vm.title} />
          <ListBodyPreview text={vm.summary} />
          {firstHashtag ? <ListHashtagOne tag={firstHashtag} /> : null}
          <ListMetaKarrot vm={vm} placeInMeta={placeInMeta} />
        </div>
      </div>
    </>
  );
}

function CardShell({ href, children }: { href: string; children: ReactNode }) {
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
    <article className={`min-h-0 ${PHILIFE_FB_CARD_CLASS}`}>
      <Link
        href={href}
        prefetch={false}
        onMouseEnter={prefetchOnIntent}
        onTouchStart={prefetchOnIntent}
        onClick={() => {
          beginRouteEntryPerf("community_detail", href);
          prefetchOnIntent();
        }}
        className="block px-3 py-3 transition-colors hover:bg-[#F7F8FA]/90 active:bg-[#F3F4F6]/80 sm:px-4"
      >
        {children}
      </Link>
    </article>
  );
}

const placeInMetaForVm = (vm: FeedListCardViewModel) => Boolean((vm.placeLine ?? "").trim());

export function FeedListLayoutCarrotThumbRight({ vm }: { vm: FeedListCardViewModel }) {
  const url = vm.thumbnailUrl;
  return (
    <CardShell href={vm.href}>
      <div
        className={url ? "min-h-[5.5rem] sm:min-h-[5.75rem]" : "min-h-[4.5rem] sm:min-h-[4.75rem]"}
      >
        <ListTextStack
          vm={vm}
          firstHashtag={null}
          placeInMeta={placeInMetaForVm(vm)}
          trailingAside={url ? <ListThumb url={url} totalImages={vm.imageCount} /> : null}
        />
      </div>
    </CardShell>
  );
}

/** 스킨 `compact_media_left`: 썸네일을 **텍스트 열 앞**에(당근 좌·우 톤, 좌·우는 스킨으로만 갈림) */
export function FeedListLayoutCarrotThumbLeft({ vm }: { vm: FeedListCardViewModel }) {
  const url = vm.thumbnailUrl;
  if (!url) {
    return (
      <CardShell href={vm.href}>
        <div className="min-h-[4.5rem] w-full min-w-0 sm:min-h-[4.75rem]">
          <ListTextStack
            vm={vm}
            firstHashtag={null}
            placeInMeta={placeInMetaForVm(vm)}
          />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href}>
      <div className="min-h-[5.5rem] w-full min-w-0 sm:min-h-[5.75rem]">
        <ListCategoryPillRow vm={vm} />
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <ListThumb url={url} totalImages={vm.imageCount} />
          <div className="flex min-w-0 flex-1 flex-col">
            <ListTitleOnly title={vm.title} />
            <ListBodyPreview text={vm.summary} />
          </div>
        </div>
        <ListMetaKarrot vm={vm} placeInMeta={placeInMetaForVm(vm)} className="!mt-2" />
      </div>
    </CardShell>
  );
}

export function FeedListLayoutTextOnly({ vm }: { vm: FeedListCardViewModel }) {
  return (
    <CardShell href={vm.href}>
      <div className="min-h-[4.5rem] w-full min-w-0 sm:min-h-[4.75rem]">
        <ListTextStack
          vm={vm}
          firstHashtag={null}
          placeInMeta={placeInMetaForVm(vm)}
        />
      </div>
    </CardShell>
  );
}

export function FeedListLayoutPlace({ vm, thumbColumn }: { vm: FeedListCardViewModel; thumbColumn: FeedListThumbColumn }) {
  const place = (vm.placeLine ?? "").trim();
  const url = vm.thumbnailUrl;
  const pinM = Boolean(place);

  if (thumbColumn === "left" && url) {
    return (
      <CardShell href={vm.href}>
        <div>
          <div className="flex min-w-0 items-start gap-2.5 sm:min-h-[5.75rem] sm:gap-3">
            <ListThumb url={url} totalImages={vm.imageCount} />
            <div className="min-w-0 flex-1">
              <ListCategoryPillRow vm={vm} />
              <ListTitleOnly title={vm.title} />
              {vm.summary.trim() ? <ListBodyPreview text={vm.summary} /> : null}
            </div>
          </div>
          <ListMetaKarrot vm={vm} placeInMeta={pinM} className="!mt-2" />
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="min-h-[5.5rem] w-full min-w-0 sm:min-h-[5.75rem]">
          <ListTextStack
            vm={vm}
            firstHashtag={null}
            placeInMeta={pinM}
            trailingAside={<ListThumb url={url} totalImages={vm.imageCount} />}
          />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href}>
      <div className="min-h-[4.5rem] w-full min-w-0 sm:min-h-[4.75rem]">
        <ListTextStack vm={vm} firstHashtag={null} placeInMeta={pinM} />
      </div>
    </CardShell>
  );
}

export function FeedListLayoutTags({ vm, thumbColumn }: { vm: FeedListCardViewModel; thumbColumn: FeedListThumbColumn }) {
  const tags = vm.hashtagTags;
  const one = tags.length > 0 ? tags[0]! : null;
  const url = vm.thumbnailUrl;
  const pinM = placeInMetaForVm(vm);

  if (thumbColumn === "left" && url) {
    return (
      <CardShell href={vm.href}>
        <div>
          <div className="flex min-w-0 items-start gap-2.5 sm:min-h-[5.75rem] sm:gap-3">
            <ListThumb url={url} totalImages={vm.imageCount} />
            <div className="min-w-0 flex-1">
              <ListCategoryPillRow vm={vm} />
              <ListTitleOnly title={vm.title} />
              <ListBodyPreview text={vm.summary} />
              {one ? <ListHashtagOne tag={one} /> : null}
            </div>
          </div>
          <ListMetaKarrot vm={vm} placeInMeta={pinM} className="!mt-2" />
        </div>
      </CardShell>
    );
  }
  if (thumbColumn === "right" && url) {
    return (
      <CardShell href={vm.href}>
        <div className="min-h-[5.5rem] w-full min-w-0 sm:min-h-[5.75rem]">
          <ListTextStack
            vm={vm}
            firstHashtag={one}
            placeInMeta={pinM}
            trailingAside={<ListThumb url={url} totalImages={vm.imageCount} />}
          />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={vm.href}>
      <div className="min-h-[4.5rem] w-full min-w-0 sm:min-h-[4.75rem]">
        <ListTextStack vm={vm} firstHashtag={one} placeInMeta={pinM} />
      </div>
    </CardShell>
  );
}
