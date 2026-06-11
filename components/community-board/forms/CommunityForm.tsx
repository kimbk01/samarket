"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState } from "react";
import Link from "next/link";
import type { BoardWriteFormProps, PostCreatePayload } from "@/lib/community-board/types";
import { useWriteBoardCategory } from "./useWriteBoardCategory";

export function CommunityForm({
  board,
  onSubmit,
  cancelHref,
  isSubmitting = false,
  communityTopics = [],
  defaultCategoryId = null,
  boardCategories = [],
}: BoardWriteFormProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topicId, setTopicId] = useState(() => communityTopics[0]?.id ?? "");
  const { needCategory, boardCategoryId, setBoardCategoryId, validateCategory, categoryPayload } =
    useWriteBoardCategory(board, boardCategories, defaultCategoryId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const catErr = validateCategory();
    if (catErr) {
      alert(catErr);
      return;
    }
    if (communityTopics.length > 0 && !topicId.trim()) {
      alert(t("community_write_select_topic_err"));
      return;
    }
    const payload: PostCreatePayload = {
      title: title.trim(),
      content: content.trim(),
      board_id: board.id,
      community_topic_id: topicId.trim() || null,
      ...categoryPayload(),
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {needCategory && (
        <div>
          <label htmlFor="board-category" className="mb-1 block text-sm font-medium text-sam-fg">
            {t("community_board_category_label")}
          </label>
          <select
            id="board-category"
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
      {communityTopics.length > 0 && (
        <div>
          <label htmlFor="community-topic" className="mb-1 block text-sm font-medium text-sam-fg">
            {t("community_write_topic_label")}
          </label>
          <select
            id="community-topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            required
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
            disabled={isSubmitting}
          >
            {communityTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-sam-fg mb-1">
          {t("community_board_title_label")}
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder={t("community_board_title_ph")}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2 focus:border-sam-primary focus:ring-2 focus:ring-sam-primary"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-sam-fg mb-1">
          {t("community_board_content_label")}
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={8}
          placeholder={t("community_board_content_ph")}
          className="w-full resize-y rounded-ui-rect border border-sam-border px-3 py-2 focus:border-sam-primary focus:ring-2 focus:ring-sam-primary"
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
        <Link
          href={cancelHref}
          className="px-4 py-2 border border-sam-border rounded-ui-rect text-sam-fg hover:bg-sam-app"
        >
          {t("common_cancel")}
        </Link>
      </div>
    </form>
  );
}
