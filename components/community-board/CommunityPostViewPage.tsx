"use client";

import { useEffect } from "react";
import { BoardSkinRenderer } from "./BoardSkinRenderer";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PostCommunityCommentsSection } from "@/components/post/PostCommunityCommentsSection";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { incrementPostViewCount } from "@/lib/posts/incrementViewCount";
import type { Board, PostDetail } from "@/lib/community-board/types";

export interface CommunityPostViewPageProps {
  board: Board;
  post: PostDetail;
  boardSlug: string;
}

/**
 * 커뮤니티 글 상세 페이지.
 * - board.skin_type으로 상세 스킨 자동 분기
 * - policy에 따라 댓글/좋아요/신고 노출
 */
export function CommunityPostViewPage({
  board,
  post,
  boardSlug: _boardSlug,
}: CommunityPostViewPageProps) {
  const baseHref = SAMARKET_ROUTES.community.home;
  const showComments = board.policy?.allow_comment !== false;
  const showLike = board.policy?.allow_like !== false;
  const showReport = board.policy?.allow_report !== false;
  const me = getCurrentUser();
  const authorUserId = post.author?.id?.trim() ?? "";

  useEffect(() => {
    void incrementPostViewCount(post.id);
  }, [post.id]);

  return (
    <div className="min-h-screen bg-sam-app">
      <div className="bg-sam-surface border-b border-sam-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <AppBackButton backHref={baseHref} ariaLabel="목록으로" />
          <span className="text-sm text-sam-muted truncate">{board.name}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <BoardSkinRenderer
          mode="detail"
          skinType={board.skin_type}
          post={post}
          board={board}
          boardSlug={_boardSlug}
          baseHref={baseHref}
          showComments={showComments}
          showLike={showLike}
          showReport={showReport}
        />
        {showComments && (
          <PostCommunityCommentsSection
            postId={post.id}
            currentUserId={me?.id ?? null}
            showCommentReport={showReport}
          />
        )}
      </div>
    </div>
  );
}
