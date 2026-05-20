"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import type { BoardListSkinProps } from "@/lib/community-board/types";
import { formatAppDate } from "@/lib/i18n/locale-for-app-language";

export function QnaListSkin({
  posts,
  baseHref,
}: BoardListSkinProps) {
  const { t, language } = useI18n();
  return (
    <ul className="divide-y divide-sam-border bg-sam-surface rounded-ui-rect overflow-hidden">
      {posts.length === 0 ? (
        <li className="px-4 py-8 text-center text-sam-muted">{t("community_board_empty_questions")}</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`${baseHref}/${post.id}`}
              className="block px-4 py-3 hover:bg-sam-app transition-colors"
            >
              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mr-2">
                Q
              </span>
              <span className="font-medium text-sam-fg">{post.title}</span>
              <div className="flex items-center gap-2 mt-2 text-xs text-sam-meta">
                {post.author?.name && <span>{post.author.name}</span>}
                <span>{formatAppDate(post.created_at, language)}</span>
                {(post.comment_count ?? 0) > 0 && (
                  <span>{t("community_board_comments_count", { count: post.comment_count ?? 0 })}</span>
                )}
              </div>
            </Link>
          </li>
        ))
      )}
    </ul>
  );
}
