"use client";

import { useEffect, useState } from "react";
import { untilLaunchDestinationSettled } from "@/lib/startup/launch-push-destination-pending";
import { useRouter } from "next/navigation";
import { Eye, MessageSquare } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";
import { philifeAppPaths } from "@/lib/philife/paths";
import { homePostCardImageSrc } from "@/lib/home/home-feed-image";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import type { HomePostsConfig } from "@/lib/home/home-layout-contract";

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
    // 설계 §24 D1-웹: 알림으로 켠 실행이면 덮개가 걷힐 때까지(목적지 그림) 홈 전용 요청을 미룬다 · 그 밖에는 바로
    void untilLaunchDestinationSettled()
      .then(() => (alive ? fetchNeighborhoodFeedShortTtl(url, { credentials: "include" }) : null))
      .then(async (res) => {
        if (!res) return;
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
 * 정보 공유 글 카드 — 시안 R3 (계획서 E · 이전 「라운지 게시판과 같은 카드」 2026-11-09 대체):
 * 휴대폰 = 글 왼쪽·사진 오른쪽 / 태블릿·PC = 사진(16:10) 위·글 아래. 크기·열은 `.home-mag` (2열 · PC 4열).
 */
export function HomePostMagCard({ post }: { post: NeighborhoodFeedPostDTO }) {
  const { language } = useI18n();
  const router = useRouter();
  const img = post.images?.[0] ? homePostCardImageSrc(post.images[0]) : "";
  /** 재감사 2026-11-27: 서버가 주제 이름을 비워 보내도(옛 행·영어) 화면 언어 주제 이름으로 — 빈칸 0 */
  const topic = resolveCommunityTopicUILabel(language, post.category_label, post.category_name_en, post.category);
  return (
    <button
      type="button"
      onClick={() => router.push(philifeAppPaths.post(post.id))}
      className={`home-mag-card${img ? "" : " home-mag-card--noimg"}`}
      data-home-feed-post={post.id}
    >
      {img ? (
        <span className="home-mag-img">
          {/* eslint-disable-next-line @next/next/no-img-element -- 정보 공유 글 사진 */}
          <img src={img} alt="" className="home-sq-img" />
        </span>
      ) : null}
      <span className="home-mag-text">
        {topic ? <span className="home-mag-topic">{topic}</span> : null}
        <span className="home-mag-title">{post.title}</span>
        <span className="home-mag-meta">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {post.view_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {post.comment_count}
          </span>
          {post.location_label ? <span className="truncate">{post.location_label}</span> : null}
        </span>
      </span>
    </button>
  );
}
