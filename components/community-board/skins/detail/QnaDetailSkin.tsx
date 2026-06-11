"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { BoardDetailSkinProps } from "@/lib/community-board/types";

export function QnaDetailSkin({
  post,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  const { t, language } = useI18n();
  return (
    <article className="bg-sam-surface rounded-ui-rect border border-sam-border overflow-hidden">
      <div className="border-l-4 border-sam-primary bg-sam-primary-soft/50 p-4">
        <span className="text-xs font-semibold text-sam-primary uppercase">{t("community_badge_question")}</span>
        <h1 className="text-xl font-semibold text-sam-fg mt-1">{post.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-sm text-sam-muted">
          {post.author?.name && <span>{post.author.name}</span>}
          <span>{new Date(post.created_at).toLocaleString(language === "en" ? "en-US" : "ko-KR")}</span>
        </div>
      </div>
      <div className="p-4">
        <div className="prose prose-sm max-w-none text-sam-fg whitespace-pre-wrap">
          {post.content}
        </div>
        {post.images && post.images.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.images.map((img) =>
              img.url ? (
                <img key={img.id} src={img.url} alt="" className="max-h-48 rounded object-cover" />
              ) : null
            )}
          </div>
        )}
      </div>
      <footer className="px-4 py-3 border-t flex gap-2">
        {showLike && <button type="button" className="text-sm text-sam-muted">{t("community_board_like")}</button>}
        {showComments && (
          <a href="#community-post-comments" className="text-sm text-sam-muted hover:text-sam-fg">
            {t("community_stat_comments_title")}
          </a>
        )}
        {showReport && <button type="button" className="text-sm text-sam-muted ml-auto">{t("community_report")}</button>}
      </footer>
    </article>
  );
}
