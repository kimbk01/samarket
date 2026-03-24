import { CommunityFeedClient } from "@/components/community/CommunityFeedClient";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { getCommunityFeedEmptyHint } from "@/lib/community-feed/community-feed-empty-hint";
import {
  listCommunityFeedPosts,
  listCommunitySections,
  listTopicsForSectionSlug,
} from "@/lib/community-feed/queries";
import { normalizeFeedSort, normalizeSectionSlug, type CommunityFeedSortMode } from "@/lib/community-feed/constants";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ section?: string; topic?: string; sort?: string }>;
}

export default async function CommunityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const section = normalizeSectionSlug(sp.section);
  const topicParam = sp.topic?.trim().toLowerCase() || null;
  const sortFromUrl = normalizeFeedSort(sp.sort);

  const topics = await listTopicsForSectionSlug(section);

  let feedSort: CommunityFeedSortMode = sortFromUrl;
  let contentTopic: string | null = topicParam;

  if (topicParam) {
    const hit = topics.find((t) => t.slug === topicParam);
    if (hit?.is_feed_sort) {
      contentTopic = null;
      if (sortFromUrl === "latest") {
        if (hit.slug === "popular") feedSort = "popular";
        else if (hit.slug === "recommended") feedSort = "recommended";
      }
    }
  }

  const [sections, posts] = await Promise.all([
    listCommunitySections(),
    listCommunityFeedPosts({
      sectionSlug: section,
      topicSlug: contentTopic,
      feedSort,
    }),
  ]);

  if (sections.length === 0 && posts.length === 0) {
    const hint = await getCommunityFeedEmptyHint();
    return (
      <div className={`${APP_MAIN_GUTTER_X_CLASS} py-10 text-center`}>
        <h1 className="text-lg font-semibold text-gray-900">동네생활</h1>
        <p className="mt-2 text-[14px] text-gray-600">
          피드 DB가 아직 적용되지 않았거나, 배포 환경의 Supabase와 로컬이 다를 수 있습니다. Supabase(SQL Editor)에 마이그레이션{" "}
          <code className="rounded bg-gray-100 px-1 text-[12px]">20260321120000_community_feed_daangn.sql</code>을{" "}
          <strong className="font-medium">Vercel에 연결된 프로젝트</strong>에도 적용한 뒤 다시 열어주세요.
        </p>
        {hint ? (
          <p className="mx-auto mt-4 max-w-md text-left text-[13px] leading-relaxed text-amber-800">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <CommunityFeedClient
      sections={sections}
      topics={topics}
      posts={posts}
      activeSection={section}
      activeTopic={contentTopic}
      activeSort={feedSort}
    />
  );
}
