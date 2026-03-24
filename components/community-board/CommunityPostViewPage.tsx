"use client";

import { useEffect } from "react";
import { BoardSkinRenderer } from "./BoardSkinRenderer";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PostCommunityCommentsSection } from "@/components/post/PostCommunityCommentsSection";
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
  boardSlug,
}: CommunityPostViewPageProps) {
  const baseHref = `/community/${boardSlug}`;
  const showComments = board.policy?.allow_comment !== false;
  const showLike = board.policy?.allow_like !== false;
  const showReport = board.policy?.allow_report !== false;
  const me = getCurrentUser();
  const authorUserId = post.author?.id?.trim() ?? "";

  useEffect(() => {
    void incrementPostViewCount(post.id);
  }, [post.id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <AppBackButton backHref={baseHref} ariaLabel="목록으로" />
          <span className="text-sm text-gray-500 truncate">{board.name}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <BoardSkinRenderer
          mode="detail"
          skinType={board.skin_type}
          post={post}
          board={board}
          boardSlug={boardSlug}
          baseHref={baseHref}
          showComments={showComments}
          showLike={showLike}
          showReport={showReport}
        />
        {showComments && (
          <PostCommunityCommentsSection
            postId={post.id}
            authorUserId={authorUserId}
            currentUserId={me?.id ?? null}
            showCommentReport={showReport}
          />
        )}
      </div>
    </div>
  );
}
