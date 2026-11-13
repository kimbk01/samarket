import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { Detail } from "@/components/community/Detail";
import { getNeighborhoodPostDetail } from "@/lib/neighborhood/queries";
import { isUuidString } from "@/lib/shared/uuid-string";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isPromotionLiveForTarget } from "@/lib/promotion/promotion-live-target";
import { buildCommunityPostPageMetadata } from "@/lib/community/share/community-post-metadata";
import { buildUnavailableSharePageMetadata } from "@/lib/share/trade-post-metadata";

interface Props {
  params: Promise<{ postId: string }>;
}

/**
 * 글 1회 로드 — 링크 미리보기(generateMetadata)와 본문이 같은 요청에서 같은 결과를 쓴다
 * (React `cache` · 통합 공유 S4: 미리보기 때문에 DB 조회를 늘리지 않는다).
 */
const loadPhilifePostForRequest = cache(async (postId: string) => {
  const viewerId = await getOptionalAuthenticatedUserId();
  const post = await getNeighborhoodPostDetail(postId, { viewerUserId: viewerId });
  return { viewerId, post };
});

/** FEED 글 링크 미리보기(OG) — 공유 정규 주소 `/community/posts/{id}` 와 같은 값 (통합 공유 S4) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!seg || !isUuidString(seg)) return {};
  try {
    const { post } = await loadPhilifePostForRequest(seg);
    return post ? buildCommunityPostPageMetadata(post) : buildUnavailableSharePageMetadata();
  } catch {
    return {};
  }
}

async function PhilifeNeighborhoodPostPageBody({ paramsPromise }: { paramsPromise: Props["params"] }) {
  const t0 = performance.now();
  const { postId } = await paramsPromise;
  const seg = postId?.trim() ?? "";
  if (!seg) redirect("/philife");

  if (!isUuidString(seg)) {
    redirect("/philife");
  }

  /**
   * 상세 첫 화면을 막는 블로킹 쿼리를 줄여 즉시 읽기 체감을 우선한다.
   * - `post`만 먼저 로드해 본문을 그린다.
   * - 댓글/유사글은 클라이언트 훅에서 로드 (`usePhilifePostComments`, `similarPosts=[]`).
   */
  const { post } = await loadPhilifePostForRequest(seg);
  if (!post) {
    notFound();
  }

  const promoSb = tryCreateSupabaseServiceClient();
  /** Owner 결정 O-3: 광고 중이면 상세에도 「광고」 */
  const promotionLive = promoSb
    ? await isPromotionLiveForTarget(promoSb, { targetType: "community_post", targetId: seg })
    : false;

  return (
    <Detail
      post={post}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
      similarPosts={[]}
      isAd={promotionLive}
    />
  );
}

/** /philife/:postId — 필라이프 글 상세 (UUID). 게시판 slug 미사용. */
export default async function PhilifeNeighborhoodPostPage({ params }: Props) {
  return <PhilifeNeighborhoodPostPageBody paramsPromise={params} />;
}
