"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useStoreFavoriteToggle } from "@/lib/stores/use-store-favorite-toggle";
import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";

function regionLine(store: FavoritedStoreListItem): string {
  return [store.region, store.city, store.district].filter(Boolean).join(" · ").trim();
}

export function FavoriteStoreRow({ store }: { store: FavoritedStoreListItem }) {
  const { t } = useI18n();
  const href = store.available && store.slug ? `/stores/${encodeURIComponent(store.slug)}` : null;
  const region = regionLine(store);
  const { favoriteBusy, toggleFavorite } = useStoreFavoriteToggle(store.slug, {
    viewerFavorited: true,
    favoriteCount: 0,
  });

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite();
  };

  const inner = (
    <div className="flex min-w-0 gap-3 py-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
        {store.profile_image_url ? (
          <SamarketThumbnail
            src={store.profile_image_url}
            fill
            fetchDisplayPx={64}
            roundedClassName="rounded-ui-rect"
            className="bg-sam-surface-muted"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center sam-text-section-title font-semibold text-sam-muted">
            {store.store_name.slice(0, 1) || "?"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 truncate sam-text-body font-semibold text-sam-fg">
            {store.store_name || t("common_content_unavailable")}
          </p>
          {store.slug ? (
            <button
              type="button"
              onClick={handleToggle}
              disabled={favoriteBusy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-red-500 disabled:opacity-60"
              aria-label={t("store_favorite_remove_aria")}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
              </svg>
            </button>
          ) : null}
        </div>
        {region ? (
          <p className="mt-0.5 truncate sam-text-helper text-sam-muted">{region}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {!store.available ? (
            <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-medium text-sam-muted">
              {t("ui_fav_store_unavailable_badge")}
            </span>
          ) : store.is_open === true ? (
            <span className="rounded-ui-rect bg-sam-success-soft px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-success">
              {t("store_open_now")}
            </span>
          ) : store.is_open === false ? (
            <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-medium text-sam-muted">
              {t("store_closed_now")}
            </span>
          ) : null}
          {typeof store.review_count === "number" && store.review_count > 0 ? (
            <span className="sam-text-xxs text-sam-meta">
              {t("ui_fav_store_rating_line", { count: store.review_count })}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0 text-inherit no-underline">
        {inner}
      </Link>
    );
  }

  return <div className="min-w-0 opacity-80">{inner}</div>;
}
