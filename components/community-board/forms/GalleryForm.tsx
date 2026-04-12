"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardWriteFormProps, PostCreatePayload } from "@/lib/community-board/types";
import { useWriteBoardCategory } from "./useWriteBoardCategory";

export function GalleryForm({
  board,
  onSubmit,
  cancelHref,
  isSubmitting = false,
  defaultCategoryId = null,
  boardCategories = [],
}: BoardWriteFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
      images: imageUrls.map((url) => ({ storage_path: url, url })),
      ...categoryPayload(),
    };
    await onSubmit(payload);
  }

  function addImage() {
    const url = prompt("이미지 URL 또는 storage_path 입력 (개발용)");
    if (url) setImageUrls((prev) => [...prev, url]);
  }

  function removeImage(i: number) {
    setImageUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needCategory && (
        <div>
          <label htmlFor="gallery-board-category" className="mb-1 block text-sm font-medium text-sam-fg">
            카테고리
          </label>
          <select
            id="gallery-board-category"
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
      <div>
        <label className="block text-sm font-medium text-sam-fg mb-1">사진</label>
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded overflow-hidden bg-sam-surface-muted">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-0 right-0 w-6 h-6 bg-red-500 text-white text-xs rounded-bl"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addImage}
            className="w-20 h-20 rounded border-2 border-dashed border-sam-border text-sam-meta flex items-center justify-center text-2xl hover:border-sam-border"
          >
            +
          </button>
        </div>
      </div>
      <div>
        <label htmlFor="gallery-title" className="block text-sm font-medium text-sam-fg mb-1">
          제목
        </label>
        <input
          id="gallery-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="제목"
          className="w-full px-3 py-2 border border-sam-border rounded-ui-rect focus:ring-2 focus:ring-blue-500"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="gallery-content" className="block text-sm font-medium text-sam-fg mb-1">
          설명
        </label>
        <textarea
          id="gallery-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="설명 (선택)"
          className="w-full px-3 py-2 border border-sam-border rounded-ui-rect focus:ring-2 focus:ring-blue-500 resize-y"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-ui-rect hover:bg-blue-700 disabled:opacity-50"
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
