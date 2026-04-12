"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardWriteFormProps, PostCreatePayload } from "@/lib/community-board/types";
import { useWriteBoardCategory } from "./useWriteBoardCategory";

export function PromoForm({
  board,
  onSubmit,
  cancelHref,
  isSubmitting = false,
  defaultCategoryId = null,
  boardCategories = [],
}: BoardWriteFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
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
      images: imageUrl ? [{ storage_path: imageUrl, url: imageUrl }] : undefined,
      ...categoryPayload(),
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needCategory && (
        <div>
          <label htmlFor="promo-board-category" className="mb-1 block text-sm font-medium text-sam-fg">
            카테고리
          </label>
          <select
            id="promo-board-category"
            value={boardCategoryId}
            onChange={(e) => setBoardCategoryId(e.target.value)}
            required
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
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
      <div className="p-3 rounded-ui-rect bg-amber-50 border border-amber-200">
        <span className="text-sm font-medium text-amber-800">프로모션 / 홍보 글</span>
      </div>
      <div>
        <label className="block text-sm font-medium text-sam-fg mb-1">대표 이미지 (선택)</label>
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="이미지 URL (개발용)"
          className="w-full px-3 py-2 border border-sam-border rounded-ui-rect focus:ring-2 focus:ring-amber-500"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="promo-title" className="block text-sm font-medium text-sam-fg mb-1">
          제목
        </label>
        <input
          id="promo-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="프로모션 제목"
          className="w-full px-3 py-2 border border-sam-border rounded-ui-rect focus:ring-2 focus:ring-amber-500"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="promo-content" className="block text-sm font-medium text-sam-fg mb-1">
          내용
        </label>
        <textarea
          id="promo-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={6}
          placeholder="프로모션 내용을 입력하세요"
          className="w-full px-3 py-2 border border-sam-border rounded-ui-rect focus:ring-2 focus:ring-amber-500 resize-y"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-amber-600 text-white rounded-ui-rect hover:bg-amber-700 disabled:opacity-50"
        >
          {isSubmitting ? "등록 중…" : "등록"}
        </button>
        <Link href={cancelHref} className="px-4 py-2 border border-sam-border rounded-ui-rect text-sam-fg hover:bg-sam-app">
          취소
        </Link>
      </div>
    </form>
  );
}
