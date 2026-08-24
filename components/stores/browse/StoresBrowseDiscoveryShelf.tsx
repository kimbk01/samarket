"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import type { StoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";

export function StoresBrowseDiscoveryShelf({
  shelf,
}: {
  shelf: StoresBrowseDiscoveryShelfPayload;
}) {
  const { t } = useI18n();
  return (
    <li className="list-none px-[var(--delivery-page-x)]" data-browse-discovery-shelf="">
      <p className="mb-2 text-[12px] font-bold text-sam-fg">{t("store_browse_discovery_shelf_title")}</p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shelf.stores.map((store) => {
          const href = `/stores/${encodeURIComponent(store.slug)}`;
          const warm = () => deliveryStoreMenusPrewarm(store.slug, { force: true });
          return (
            <Link
              key={store.storeId}
              href={href}
              prefetch={false}
              onPointerDown={warm}
              onFocus={warm}
              className="flex w-[11.5rem] shrink-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
            >
              <div className="relative aspect-[16/10] w-full bg-[color:var(--delivery-bg-thumb)]">
                {store.imageUrl ?
                  <StoreProductThumbnail
                    src={store.imageUrl}
                    alt={store.name}
                    fill
                    fetchPreset="hubFood"
                    className="absolute inset-0"
                    imageClassName="h-full w-full object-cover"
                    roundedClassName="rounded-none"
                    loading="lazy"
                  />
                : (
                  <div className="flex h-full items-center justify-center text-sm font-bold text-sam-muted">
                    {store.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="space-y-0.5 p-2">
                <p className="line-clamp-1 text-[13px] font-semibold text-sam-fg">{store.name}</p>
                {store.etaLabel ?
                  <p className="line-clamp-1 text-[12px] text-sam-muted">{store.etaLabel}</p>
                : null}
              </div>
            </Link>
          );
        })}
      </div>
    </li>
  );
}
