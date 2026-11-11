"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimPostDto } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";

/** 글 한 줄 — 게시판 · 글쓴이(모임 닉네임) · 시간 · 제목 */
export function MoimPostRow({ post, boardLabel }: { post: MoimPostDto; boardLabel: string }) {
  const { t, language } = useI18n();
  const author = post.author.isActiveMember ? post.author.nickname : t("moim_screen_left_member");
  const headline = post.title.trim() || post.body.trim().split("\n")[0] || "";
  return (
    <Link href={moimRoutes.post(post.moimId, post.id)} className={`${moimCls.card} block min-w-0 p-3 active:bg-sam-surface-muted`}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-sam-muted">
        {post.isPinned ? <span className={`${moimCls.badge} ${moimCls.badgeGreen}`}>{t("moim_post_pinned_badge")}</span> : null}
        {post.visibility === "public" ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_post_public_badge")}</span> : null}
        <span>{[boardLabel, author, formatRelativeTimeAgo(post.createdAt, language)].filter(Boolean).join(" · ")}</span>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-[14px] font-medium text-sam-fg">{headline}</p>
      {post.commentCount > 0 ? (
        <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-sam-muted">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {post.commentCount}
        </span>
      ) : null}
    </Link>
  );
}
