"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CommunityPostShareCardData } from "@/lib/community/share/community-share-payload";
import { buildCommunityPostSharePath } from "@/lib/community/share/community-share-url";
import { CM_META_CLASS } from "@/lib/community/community-ui-classes";

export function parseCommunityPostShareMetadata(
  metadata: Record<string, unknown> | null | undefined
): CommunityPostShareCardData | null {
  if (!metadata || metadata.kind !== "community_post_share") return null;
  const postId = typeof metadata.postId === "string" ? metadata.postId.trim() : "";
  if (!postId) return null;
  const canonicalUrl =
    typeof metadata.canonicalUrl === "string" && metadata.canonicalUrl.trim()
      ? metadata.canonicalUrl.trim()
      : buildCommunityPostSharePath(postId);
  return {
    postId,
    title: typeof metadata.title === "string" ? metadata.title : "",
    excerpt: typeof metadata.excerpt === "string" ? metadata.excerpt : "",
    categoryName: typeof metadata.categoryName === "string" ? metadata.categoryName : "",
    authorName: typeof metadata.authorName === "string" ? metadata.authorName : "",
    thumbnailUrl:
      typeof metadata.thumbnailUrl === "string" && metadata.thumbnailUrl.trim()
        ? metadata.thumbnailUrl.trim()
        : null,
    canonicalUrl,
  };
}

type Props = {
  card: CommunityPostShareCardData;
};

export function CommunityPostShareMessageCard({ card }: Props) {
  const href = useMemo(() => {
    if (card.canonicalUrl.startsWith("http")) return card.canonicalUrl;
    return buildCommunityPostSharePath(card.postId);
  }, [card.canonicalUrl, card.postId]);

  return (
    <Link
      href={href}
      className="block min-w-[220px] max-w-[min(100%,280px)] overflow-hidden rounded-[16px] border border-[var(--cm-border)] bg-white shadow-sm"
    >
      {card.thumbnailUrl ? (
        <SamarketThumbnail
          src={card.thumbnailUrl}
          alt=""
          fill
          className="relative h-28 w-full"
          roundedClassName="rounded-none"
        />
      ) : null}
      <div className="p-3">
        {card.categoryName ? (
          <span className="inline-flex max-w-full truncate rounded-full bg-[color-mix(in_srgb,var(--cm-primary)_10%,white)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cm-primary)]">
            {card.categoryName}
          </span>
        ) : null}
        <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--cm-text)]">
          {card.title || card.categoryName}
        </p>
        {card.excerpt ? <p className={`mt-0.5 line-clamp-2 ${CM_META_CLASS}`}>{card.excerpt}</p> : null}
        {card.authorName ? <p className={`mt-1 truncate ${CM_META_CLASS}`}>{card.authorName}</p> : null}
      </div>
    </Link>
  );
}
