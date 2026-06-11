"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
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
    const url = prompt(t("community_board_gallery_image_url_prompt"));
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
            {t("community_board_category_label")}
          </label>
          <select
            id="gallery-board-category"
            value={boardCategoryId}
            onChange={(e) => setBoardCategoryId(e.target.value)}
            required
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
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
        <label className="block text-sm font-medium text-sam-fg mb-1">{t("community_board_photos_label")}</label>
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
          {t("community_board_title_label")}
        </label>
        <input
          id="gallery-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder={t("ui_write_title_ph")}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2 focus:ring-2 focus:ring-sam-primary"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="gallery-content" className="block text-sm font-medium text-sam-fg mb-1">
          {t("community_board_desc_label")}
        </label>
        <textarea
          id="gallery-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder={t("community_board_desc_optional_ph")}
          className="w-full resize-y rounded-ui-rect border border-sam-border px-3 py-2 focus:ring-2 focus:ring-sam-primary"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-ui-rect bg-sam-primary px-4 py-2 text-white hover:bg-sam-primary-hover active:bg-sam-primary-active disabled:bg-sam-primary-disabled disabled:text-white disabled:opacity-100"
        >
          {isSubmitting ? t("community_write_submitting") : t("community_comment_submit")}
        </button>
        <Link href={cancelHref} className="px-4 py-2 border border-sam-border rounded-ui-rect text-sam-fg hover:bg-sam-app">
          {t("common_cancel")}
        </Link>
      </div>
    </form>
  );
}
