"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CommunityFeedPostDTO, CommunitySectionDTO, CommunityTopicDTO } from "@/lib/community-feed/types";
import { normalizeSectionSlug, type CommunityFeedSortMode } from "@/lib/community-feed/constants";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
  APP_TOP_MENU_ROW2_BASE,
  APP_TOP_MENU_ROW2_INACTIVE_SKY,
} from "@/lib/ui/app-top-menu";
import { CommunityComposeSheet } from "./CommunityComposeSheet";
import { CommunityPostCard } from "./CommunityPostCard";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { HorizontalDragScroll } from "./HorizontalDragScroll";

function feedHref(sectionSlug: string, opts?: { topic?: string | null; sort?: CommunityFeedSortMode }) {
  const p = new URLSearchParams();
  const sec = normalizeSectionSlug(sectionSlug);
  if (sec !== "dongnae") p.set("section", sec);
  const sort = opts?.sort ?? "latest";
  if (sort !== "latest") p.set("sort", sort);
  const t = opts?.topic?.trim();
  if (t) p.set("topic", t.toLowerCase());
  const q = p.toString();
  return q ? `/community?${q}` : "/community";
}

export function CommunityFeedClient({
  sections,
  topics,
  posts,
  activeSection,
  activeTopic,
  activeSort,
}: {
  sections: CommunitySectionDTO[];
  topics: CommunityTopicDTO[];
  posts: CommunityFeedPostDTO[];
  activeSection: string;
  /** 주제 칩(정렬칩 제외) */
  activeTopic: string | null;
  activeSort: CommunityFeedSortMode;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sec = normalizeSectionSlug(activeSection);

  const sectionTabs = useMemo(() => {
    if (sections.length > 0) return sections;
    return [
      { id: "x1", name: "동네생활", slug: "dongnae", sort_order: 0 },
      { id: "x2", name: "모임", slug: "meetup", sort_order: 1 },
      { id: "x3", name: "아파트", slug: "apartment", sort_order: 2 },
    ] as CommunitySectionDTO[];
  }, [sections]);

  const contentTopics = useMemo(() => topics.filter((t) => !t.is_feed_sort), [topics]);

  const scrollNavClass =
    "-mx-1 flex w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

  const feedColumnClass = `w-full min-w-0 ${APP_MAIN_GUTTER_X_CLASS}`;

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-28">
      <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/95 backdrop-blur sm:shadow-sm">
        <div className={`${feedColumnClass} border-b border-gray-100 py-2 pt-3`}>
          <HorizontalDragScroll
            className={scrollNavClass}
            style={{ WebkitOverflowScrolling: "touch" }}
            aria-label="섹션"
          >
            {sectionTabs.map((s) => {
              const on = sec === s.slug;
              return (
                <Link
                  key={s.id}
                  href={feedHref(s.slug, { sort: activeSort })}
                  scroll={false}
                  className={`${APP_TOP_MENU_ROW1_BASE} ${on ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`}
                >
                  {s.name}
                </Link>
              );
            })}
          </HorizontalDragScroll>
        </div>

        <div className={`${feedColumnClass} border-t border-gray-50 py-2`}>
          <div className="flex w-full min-w-0 items-center gap-2">
            <div className="shrink-0">
              <label htmlFor="community-feed-sort" className="sr-only">
                피드 정렬
              </label>
              <select
                id="community-feed-sort"
                value={activeSort}
                onChange={(e) => {
                  const next = e.target.value as CommunityFeedSortMode;
                  router.push(feedHref(sec, { topic: activeTopic, sort: next }));
                }}
                className="w-max max-w-full appearance-none rounded-none border border-gray-300 bg-gray-100 py-1 pl-1 pr-5 text-[13px] font-semibold text-gray-900 shadow-none outline-none focus:border-gray-500 focus:ring-0"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='4' viewBox='0 0 7 4'%3E%3Cpath fill='%236b7280' d='M0 0h7L3.5 4z'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 4px center",
                  backgroundSize: "7px 4px",
                  fieldSizing: "content",
                }}
              >
                <option value="latest">최신순</option>
                <option value="popular">인기순</option>
                <option value="recommended">추천순</option>
              </select>
            </div>
            <HorizontalDragScroll
              className={`min-w-0 flex-1 ${scrollNavClass} py-0.5`}
              style={{ WebkitOverflowScrolling: "touch" }}
              aria-label="주제 필터"
            >
              {contentTopics.map((t) => {
                const on = activeTopic === t.slug;
                return (
                  <Link
                    key={t.id}
                    href={feedHref(sec, { topic: t.slug, sort: activeSort })}
                    scroll={false}
                    className={`${APP_TOP_MENU_ROW2_BASE} ${on ? "text-white" : APP_TOP_MENU_ROW2_INACTIVE_SKY}`}
                    style={on ? { backgroundColor: t.color ?? "#0284c7" } : undefined}
                  >
                    {t.name}
                  </Link>
                );
              })}
            </HorizontalDragScroll>
          </div>
        </div>
      </header>

      <div className={`${feedColumnClass} space-y-3 pt-3`}>
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-[14px] text-gray-500">
            아직 글이 없어요. 첫 글을 남겨보세요.
          </div>
        ) : (
          posts.map((p) => <CommunityPostCard key={p.id} post={p} />)
        )}
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="kasama-quick-add fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-signature text-white shadow-lg"
        aria-label="글쓰기 메뉴"
      >
        <span className="text-2xl leading-none">+</span>
      </button>

      <CommunityComposeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} sectionSlug={sec} />
    </div>
  );
}
