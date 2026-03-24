"use client";

import { useState } from "react";
import { getWriteForm } from "@/lib/community-board/form-registry";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { submitCommunityPost } from "@/lib/community-board/submit-community-post";
import type { Board, PostCreatePayload } from "@/lib/community-board/types";

export interface CommunityWritePageProps {
  board: Board;
  boardSlug: string;
  defaultCategoryId?: string | null;
  /** board_category 모드(서버에서 주입) */
  boardCategories?: { id: string; slug: string; name: string }[];
  /** 동네생활 주제(서버에서 주입) */
  communityTopics?: { id: string; name: string }[];
}

/**
 * 커뮤니티 글쓰기 페이지.
 * - board.form_type으로 폼 컴포넌트 자동 분기
 * - form_type: basic(community_form), gallery, qna(question_form), promo(promo_form)
 */
export function CommunityWritePage({
  board,
  boardSlug,
  defaultCategoryId = null,
  boardCategories = [],
  communityTopics = [],
}: CommunityWritePageProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cancelHref = `/community/${boardSlug}`;

  const handleSubmit = async (payload: PostCreatePayload) => {
    setIsSubmitting(true);
    try {
      await submitCommunityPost(boardSlug, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const Form = getWriteForm(board.form_type);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <AppBackButton backHref={cancelHref} ariaLabel="취소" />
          <h1 className="text-lg font-semibold text-gray-900">글쓰기</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <Form
            board={board}
            onSubmit={handleSubmit}
            cancelHref={cancelHref}
            defaultCategoryId={defaultCategoryId}
            boardCategories={boardCategories}
            communityTopics={communityTopics}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
