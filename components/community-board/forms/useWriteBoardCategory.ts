"use client";

import { useEffect, useState } from "react";
import type { Board } from "@/lib/community-board/types";

export type WriteBoardCategoryRow = { id: string; name: string };

/**
 * board_category 모드 + 활성 카테고리가 있을 때 글쓰기용 카테고리 id 상태
 */
export function useWriteBoardCategory(
  board: Board,
  boardCategories: WriteBoardCategoryRow[] | undefined,
  defaultCategoryId: string | null | undefined
) {
  const needCategory = board.category_mode === "board_category" && (boardCategories?.length ?? 0) > 0;
  const [boardCategoryId, setBoardCategoryId] = useState("");

  useEffect(() => {
    if (!needCategory || !boardCategories?.length) {
      setBoardCategoryId("");
      return;
    }
    const fromDefault =
      defaultCategoryId && boardCategories.some((c) => c.id === defaultCategoryId)
        ? defaultCategoryId
        : boardCategories[0]!.id;
    setBoardCategoryId(fromDefault);
  }, [needCategory, board.id, defaultCategoryId, boardCategories]);

  function validateCategory(): string | null {
    if (!needCategory) return null;
    if (!boardCategoryId.trim()) return "카테고리를 선택하세요.";
    if (!boardCategories!.some((c) => c.id === boardCategoryId)) return "유효하지 않은 카테고리입니다.";
    return null;
  }

  function categoryPayload(): { board_category_id: string | null } | object {
    if (!needCategory) return {};
    return { board_category_id: boardCategoryId.trim() || null };
  }

  return {
    needCategory,
    boardCategoryId,
    setBoardCategoryId,
    validateCategory,
    categoryPayload,
  };
}
