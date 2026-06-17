"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { CommunityPostShareCardData } from "@/lib/community/share/community-share-payload";
import { CM_META_CLASS } from "@/lib/community/community-ui-classes";

type Props = {
  card: CommunityPostShareCardData;
};

export function CommunitySharePreviewCard({ card }: Props) {
  return (
    <div className="flex min-w-0 gap-3 rounded-[var(--cm-radius-card)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] p-3">
      {card.thumbnailUrl ? (
        <SamarketThumbnail
          src={card.thumbnailUrl}
          alt=""
          size={64}
          className="h-16 w-16 shrink-0"
          roundedClassName="rounded-[12px]"
        />
      ) : (
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] bg-[color-mix(in_srgb,var(--cm-primary)_12%,white)] text-[11px] font-semibold text-[var(--cm-primary)]"
          aria-hidden
        >
          DIBAY
        </div>
      )}
      <div className="min-w-0 flex-1">
        {card.categoryName ? (
          <span className="inline-flex max-w-full truncate rounded-full bg-[color-mix(in_srgb,var(--cm-primary)_10%,white)] px-2 py-0.5 text-[11px] font-semibold text-[var(--cm-primary)]">
            {card.categoryName}
          </span>
        ) : null}
        <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--cm-text)]">
          {card.title || card.categoryName}
        </p>
        {card.excerpt ? (
          <p className={`mt-0.5 line-clamp-2 ${CM_META_CLASS}`}>{card.excerpt}</p>
        ) : null}
        {card.authorName ? (
          <p className={`mt-1 truncate ${CM_META_CLASS}`}>{card.authorName}</p>
        ) : null}
      </div>
    </div>
  );
}
