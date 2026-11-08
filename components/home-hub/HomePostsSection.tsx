"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityCard } from "@/components/community/CommunityCard";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import type { HomePostsConfig } from "@/lib/home/home-layout-contract";
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";
import { COMMUNITY_FEED_LIST_WRAP_CLASS, COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/**
 * 「교민 이야기」 — 정보교환 게시판 목록과 **같은 카드**(`CommunityCard`)를 그대로 쓴다
 * (Owner 2026-11-09 「게시판 리스트와 동일하게」 · 「게시판 부분의 테두리」). 카드 토큰은 `[data-community-ui]` 안에서만
 * 정의되므로 같은 범위로 감싼다(없으면 테두리가 검게 그려짐 — 운영 11-09 실기 결함). 데이터 = 정보교환 전체 피드, 공지 제외.
 * 새로고침 때 다시 받는다.
 */
export function HomePostsSection({
  config,
  title,
  refreshSeq,
}: {
  config: HomePostsConfig;
  title: string;
  refreshSeq: number;
}) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    const url = buildPhilifeNeighborhoodFeedClientUrl({
      globalFeed: true,
      sort: config.sort,
      limit: config.count + 3,
      ...(config.topicSlug ? { category: config.topicSlug } : {}),
    });
    void fetchNeighborhoodFeedShortTtl(url, { credentials: "include" })
      .then(async (res) => {
        const data = (res.ok ? await res.json() : null) as { posts?: NeighborhoodFeedPostDTO[] } | null;
        if (alive) setPosts((data?.posts ?? []).filter((p) => !p.is_notice).slice(0, config.count));
      })
      .catch(() => {
        if (alive) setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [config.count, config.sort, config.topicSlug, refreshSeq]);

  return (
    <section className="mt-3 pt-[18px]" data-home-posts>
      <HomeSectionHead title={title} />
      {posts == null ? (
        <div className="space-y-3 px-4 pb-5">
          {[0, 1].map((i) => (
            <span key={i} className="block h-[88px] animate-pulse rounded-ui-rect bg-[#eef1ee]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="px-[18px] pb-5 text-[13.5px] text-[#767676]">{t("home_posts_empty")}</p>
      ) : (
        /* 게시판(`CommunityFeed`)과 같은 토큰 범위·같은 목록 틀 — 테두리·모서리·간격이 게시판과 같다 */
        <div data-community-ui className={COMMUNITY_FONT_CLASS}>
          <ul className={`${COMMUNITY_FEED_LIST_WRAP_CLASS} !pb-0`}>
            {posts.map((p) => (
              <li key={p.id} className="list-none">
                <CommunityCard post={p} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
