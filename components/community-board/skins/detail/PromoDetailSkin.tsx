"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { BoardDetailSkinProps } from "@/lib/community-board/types";

export function PromoDetailSkin({
  post,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  const { t, language } = useI18n();
  const thumb = post.images?.[0]?.url;

  return (
    <article className="bg-gradient-to-b from-amber-50 to-white rounded-ui-rect overflow-hidden border-2 border-amber-100">
      {thumb && (
        <div className="aspect-video bg-amber-50">
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-5">
        <span className="text-xs font-bold text-amber-700 uppercase">{t("community_board_promo_label")}</span>
        <h1 className="text-xl font-bold text-sam-fg mt-1">{post.title}</h1>
        <p className="text-sm text-sam-muted mt-1">
          {post.author?.name} · {new Date(post.created_at).toLocaleDateString(language === "en" ? "en-US" : "ko-KR")}
        </p>
        <div className="mt-4 text-sam-fg text-sm whitespace-pre-wrap">{post.content}</div>
        {post.images && post.images.length > 1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {post.images.slice(1).map((img) =>
              img.url ? (
                <img key={img.id} src={img.url} alt="" className="h-24 w-auto rounded object-cover" />
              ) : null
            )}
          </div>
        )}
      </div>
      <footer className="px-5 py-3 border-t border-amber-100 flex gap-2">
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
