"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ThumbsUp, MessageCircle } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { formatTimeAgo } from "@/lib/utils/format";
import { resolveNeighborhoodFeedListThumbnail } from "@/lib/community-feed/feed-list-thumbnail";
import { philifeAppPaths } from "@domain/philife/paths";
import { normalizeFeedListBodyPreview } from "../feed-list-layouts";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

type Props = {
  currentPostId: string;
  posts: NeighborhoodFeedPostDTO[];
};

export function CommunitySimilarPostsSection({ currentPostId, posts }: Props) {
  const { t, language } = useI18n();
  const rows = useMemo(() => {
    const list = posts.filter((p) => p.id !== currentPostId).slice(0, 6);
    return list.map((p) => {
      const url = resolveNeighborhoodFeedListThumbnail(p);
      const timeLabel =
        p.created_at && !Number.isNaN(Date.parse(p.created_at))
          ? formatTimeAgo(p.created_at, language)
          : "";
      const preview = normalizeFeedListBodyPreview(
        p.summary || (p.content && p.content.length < 200 ? p.content : "") || ""
      );
      const topicLabel = resolveCommunityTopicUILabel(
        language,
        p.category_label,
        p.category_name_en,
        p.category
      );
      return { post: p, url, timeLabel, preview, topicLabel };
    });
  }, [posts, currentPostId, language]);
  if (rows.length === 0) return null;

  return (
    <section className="mt-2 px-4 pb-6">
      <div className={PHILIFE_FB_CARD_CLASS}>
        <div className="px-4 py-4">
          <h2 className="m-0 text-[17px] font-bold leading-[1.35] text-[#1F2430]">{t("community_similar_posts")}</h2>
          <ul className="m-0 mt-3 list-none divide-y divide-[#E5E7EB] p-0">
            {rows.map(({ post: p, url, timeLabel, preview, topicLabel }) => (
                <li key={p.id} className="py-3.5 first:pt-0">
                  <Link href={philifeAppPaths.post(p.id)} className="flex min-w-0 gap-2.5 active:opacity-90">
                    <div className="min-w-0 flex-1">
                      <span className="inline-block max-w-full truncate rounded-[4px] bg-[#F7F8FA] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]">
                        {topicLabel}
                      </span>
                      <p className="mt-1 line-clamp-1 text-[15px] font-semibold leading-[1.4] text-[#1F2430]">{p.title || t("community_no_title")}</p>
                      {preview ? (
                        <p className="mt-0.5 line-clamp-1 text-[13px] font-normal leading-[1.45] text-[#6B7280]">{preview}</p>
                      ) : null}
                      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] font-normal leading-[1.4] text-[#9CA3AF]">
                          {p.location_label}
                          {p.location_label && timeLabel ? " · " : null}
                          {timeLabel}
                          {" · "}
                          {t("community_stat_views_inline", { count: p.view_count })}
                        </p>
                        <div className="flex shrink-0 items-center gap-2 text-[12px] font-normal text-[#6B7280]">
                          <span className="inline-flex items-center gap-0.5">
                            <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {p.like_count}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {p.comment_count}
                          </span>
                        </div>
                      </div>
                    </div>
                    {url ? (
                      <SamarketThumbnail
                        src={url}
                        size={64}
                        roundedClassName="rounded-[4px]"
                        className="bg-[#F7F8FA]"
                      />
                    ) : null}
                  </Link>
                </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
