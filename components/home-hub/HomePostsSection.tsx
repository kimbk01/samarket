"use client";

import { useEffect, useState } from "react";
import { CommunityCard } from "@/components/community/CommunityCard";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import type { HomePostsConfig } from "@/lib/home/home-layout-contract";
import { COMMUNITY_FEED_LIST_WRAP_CLASS, COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/**
 * 홈 피드의 정보 공유 글 (홈 시안 v4) — 데이터 = 정보 공유 전체 피드(어드민 정렬, 기본 인기순 — 라운지 최신순과 겹치지 않게), 공지 제외.
 * 새로고침 때 다시 받는다.
 */
export function useHomePosts({
  config,
  refreshSeq,
}: {
  config: HomePostsConfig;
  refreshSeq: number;
}): { posts: NeighborhoodFeedPostDTO[] | null; failed: boolean; retry: () => void } {
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  /** D1 §4 — 허브 보관대에서 다시 보일 때 같은 조건·60초 안이면 다시 받지 않음 */
  const revisitGate = useHubDataRevisitGate();

  useEffect(() => {
    let alive = true;
    const url = buildPhilifeNeighborhoodFeedClientUrl({
      globalFeed: true,
      sort: config.sort,
      limit: config.count + 3,
      ...(config.topicSlug ? { category: config.topicSlug } : {}),
    });
    const gateKey = `${url}|${refreshSeq}|${retryKey}`;
    if (revisitGate.isFresh(gateKey)) return;
    void fetchNeighborhoodFeedShortTtl(url, { credentials: "include" })
      .then(async (res) => {
        const data = (res.ok ? await res.json() : null) as { posts?: NeighborhoodFeedPostDTO[] } | null;
        if (!alive) return;
        // 실패는 「글 없음」이 아니라 오류로 보인다 (감사 E8)
        if (!data || !Array.isArray(data.posts)) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setPosts(data.posts.filter((p) => !p.is_notice).slice(0, config.count));
        revisitGate.markLoaded(gateKey);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [config.count, config.sort, config.topicSlug, refreshSeq, retryKey, revisitGate]);

  return {
    posts,
    failed,
    retry: () => {
      setFailed(false);
      setPosts(null);
      setRetryKey((n) => n + 1);
    },
  };
}

/**
 * 정보 공유 글 카드 — 라운지 게시판과 **같은 카드**(`CommunityCard`, Owner 2026-11-09 「게시판 리스트와 동일하게」).
 * 카드 토큰은 `[data-community-ui]` 안에서만 정의되므로 같은 범위로 감싼다(없으면 테두리가 검게 그려짐 — 운영 11-09 실기 결함).
 */
export function HomePostFeedCard({ post }: { post: NeighborhoodFeedPostDTO }) {
  return (
    <div data-community-ui className={COMMUNITY_FONT_CLASS} data-home-feed-post={post.id}>
      <ul className={`${COMMUNITY_FEED_LIST_WRAP_CLASS} !px-0 !pb-0 !pt-0`}>
        <li className="list-none">
          <CommunityCard post={post} />
        </li>
      </ul>
    </div>
  );
}
