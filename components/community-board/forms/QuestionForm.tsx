"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardWriteFormProps, PostCreatePayload } from "@/lib/community-board/types";
import { useWriteBoardCategory } from "./useWriteBoardCategory";

export function QuestionForm({
  board,
  onSubmit,
  cancelHref,
  isSubmitting = false,
  defaultCategoryId = null,
  boardCategories = [],
}: BoardWriteFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const { needCategory, boardCategoryId, setBoardCategoryId, validateCategory, categoryPayload } =
    useWriteBoardCategory(board, boardCategories, defaultCategoryId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const catErr = validateCategory();
    if (catErr) {
      alert(catErr);
      return;
    }
    const payload: PostCreatePayload = {
      title: title.trim(),
      content: content.trim(),
      board_id: board.id,
      ...categoryPayload(),
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needCategory && (
        <div>
          <label htmlFor="q-board-category" className="mb-1 block text-sm font-medium text-gray-700">
            카테고리
          </label>
          <select
            id="q-board-category"
            value={boardCategoryId}
            onChange={(e) => setBoardCategoryId(e.target.value)}
            required
            className="w-full rounded-ui-rect border border-gray-300 px-3 py-2 text-[14px]"
            disabled={isSubmitting}
          >
            {boardCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="p-3 rounded-ui-rect bg-blue-50 border border-blue-100">
        <span className="text-sm font-medium text-blue-800">질문하기</span>
      </div>
      <div>
        <label htmlFor="q-title" className="block text-sm font-medium text-gray-700 mb-1">
          질문 제목
        </label>
        <input
          id="q-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="질문을 한 줄로 요약해 주세요"
          className="w-full px-3 py-2 border border-gray-300 rounded-ui-rect focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="q-content" className="block text-sm font-medium text-gray-700 mb-1">
          상세 내용
        </label>
        <textarea
          id="q-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={6}
          placeholder="질문 내용을 자세히 적어 주세요"
          className="w-full px-3 py-2 border border-gray-300 rounded-ui-rect focus:ring-2 focus:ring-blue-500 resize-y"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-ui-rect hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "등록 중…" : "질문 등록"}
        </button>
        <Link href={cancelHref} className="px-4 py-2 border border-gray-300 rounded-ui-rect text-gray-700 hover:bg-gray-50">
          취소
        </Link>
      </div>
    </form>
  );
}
