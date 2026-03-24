import { CommunityFeedClient } from "@/components/community/CommunityFeedClient";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  listCommunityFeedPosts,
  listCommunitySections,
  listTopicsForSectionSlug,
} from "@/lib/community-feed/queries";
import { normalizeFeedSort, normalizeSectionSlug, type CommunityFeedSortMode } from "@/lib/community-feed/constants";

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
    return (
      <div className={`${APP_MAIN_GUTTER_X_CLASS} py-10 text-center`}>
        <h1 className="text-lg font-semibold text-gray-900">동네생활</h1>
        <p className="mt-2 text-[14px] text-gray-600">
          피드 DB가 아직 적용되지 않았습니다. Supabase에 마이그레이션{" "}
          <code className="rounded bg-gray-100 px-1 text-[12px]">20260321120000_community_feed_daangn.sql</code>을 적용한 뒤
          다시 열어주세요.
        </p>
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
