"use client";

import Link from "next/link";
import { BoardSkinRenderer } from "./BoardSkinRenderer";
import type { Board, PostListItem } from "@/lib/community-board/types";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";

export interface CommunityBoardPageProps {
  board: Board;
  posts: PostListItem[];
  boardSlug: string;
  categorySlug?: string | null;
  /** ?topic=slug 주제 필터 */
  topicSlug?: string | null;
  localTopics?: { slug: string; name: string }[];
  /** board_category 모드 — 목록 칩용 */
  boardCategories?: { slug: string; name: string }[];
  /** 필터와 동일한 기준 공개 글 총계 (실패 시 posts.length로 대체) */
  totalPostCount?: number | null;
  /** 피드 홈(/community) 등 — 상단 제목만 동네생활로 */
  headerTitleOverride?: string | null;
  /** true면 게시판 설명 문단 숨김 */
  hideBoardDescription?: boolean;
  /** 주제·카테고리 칩이 가리킬 목록 베이스 (기본: /community/{slug}) */
  feedFilterBaseHref?: string | null;
}

/**
 * 커뮤니티 게시판 리스트 페이지.
 * - board.skin_type으로 리스트 스킨 자동 분기
 * - 상단: 보드명, 설명, 글쓰기 버튼
 */
export function CommunityBoardPage({
  board,
  posts,
  boardSlug: _boardSlug,
  categorySlug = null,
  topicSlug = null,
  localTopics = [],
  boardCategories = [],
  totalPostCount = null,
  headerTitleOverride = null,
  hideBoardDescription = false,
  feedFilterBaseHref = null,
}: CommunityBoardPageProps) {
  const baseHref = SAMARKET_ROUTES.community.home;
  const filterBaseHref = (feedFilterBaseHref?.trim() || baseHref) as string;
  const showCategoryFilter = board.category_mode === "board_category";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-900">
            {headerTitleOverride?.trim() ? headerTitleOverride.trim() : board.name}
          </h1>
          {!hideBoardDescription && board.description ? (
            <p className="text-sm text-gray-500 mt-1">{board.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-gray-500">
              글 {totalPostCount ?? posts.length}개
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={
                  categorySlug
                    ? `${SAMARKET_ROUTES.community.write}?category=${encodeURIComponent(categorySlug)}`
                    : SAMARKET_ROUTES.community.write
                }
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                글쓰기
              </Link>
            </div>
          </div>
          {localTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              <Link
                href={filterBaseHref}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                  !topicSlug ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                전체
              </Link>
              {localTopics.map((t) => (
                <Link
                  key={t.slug}
                  href={`${filterBaseHref}?topic=${encodeURIComponent(t.slug)}`}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                    topicSlug === t.slug
                      ? "bg-sky-700 text-white"
                      : "bg-sky-50 text-sky-900 hover:bg-sky-100"
                  }`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <BoardSkinRenderer
          mode="list"
          skinType={board.skin_type}
          posts={posts}
          board={board}
          baseHref={baseHref}
          filterBaseHref={filterBaseHref !== baseHref ? filterBaseHref : undefined}
          showCategoryFilter={showCategoryFilter}
          categorySlug={categorySlug}
          boardCategories={boardCategories}
        />
      </div>
    </div>
  );
}
