"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";

export function StoresBrowseDiscoveryShelf({
  shelf,
}: {
  shelf: StoresBrowseDiscoveryShelfPayload;
}) {
  const { t, language } = useI18n();
  return (
    <li className="list-none px-[var(--delivery-page-x)]" data-browse-discovery-shelf="">
      <p className="mb-2 text-[12px] font-bold text-sam-fg">
        {t("store_browse_discovery_shelf_title")}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shelf.items.map((item) => (
          <Link
            key={item.topicSlug}
            href={item.href}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
          >
            {language === "en" ? item.nameEn : item.nameKo}
          </Link>
        ))}
      </div>
    </li>
  );
}
