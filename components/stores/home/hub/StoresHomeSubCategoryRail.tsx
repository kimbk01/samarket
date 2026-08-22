"use client";

import Link from "next/link";
import { useState } from "react";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import type { StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";
import {
  STORES_HOME_SUB_CATEGORY_ICON_WRAP,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
  STORES_HOME_SUB_CATEGORY_RAIL,
} from "@/lib/stores/stores-home-ui";
import { getStoresHomeCategoryChromeHandlers } from "@/lib/stores/stores-home-category-chrome-store";

const RESTAURANT_SLUG = "restaurant";

/** TIER2 secondary rail — single instance in header stack below TIER3. */
export function StoresHomeSubCategoryRail({
  primarySlug,
  subs,
  language,
}: {
  primarySlug: string;
  subs: StoreTaxonomyTopic[];
  language: "ko" | "en";
}) {
  const { onPrewarmSub } = getStoresHomeCategoryChromeHandlers();
  const [pressedSlug, setPressedSlug] = useState<string | null>(null);
  const clearPressed = (el?: EventTarget | null) => {
    if (el instanceof HTMLElement) {
      el.classList.remove("stores-home-sub-category-link--pressed");
    }
    setPressedSlug(null);
  };

  return (
    <div className={STORES_HOME_SUB_CATEGORY_RAIL}>
      {subs.map((s, idx) => {
        const subSlug = String(s.slug ?? "").trim().toLowerCase();
        const uploaded = storeTaxonomyUploadedImageUrl(s.image_url);
        const src = uploaded ? resolveStoreTaxonomyImageSrc(uploaded, null) : null;
        const label =
          primarySlug === RESTAURANT_SLUG ?
            resolveStoreFoodSubtopicLabel(
              language,
              subSlug,
              String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim()
            )
          : resolveStoreTopicLabel(
              language,
              s.slug,
              String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim(),
              (s as { name_en?: string | null }).name_en
            );
        const pressed = pressedSlug === s.slug;
        return (
          <Link
            key={s.id}
            href={storesBrowsePath(primarySlug, s.slug)}
            prefetch={false}
            className={`${STORES_HOME_SUB_CATEGORY_LINK} ${pressed ? "stores-home-sub-category-link--pressed" : ""}`}
            aria-label={label}
            onPointerDown={(e) => {
              e.currentTarget.classList.add("stores-home-sub-category-link--pressed");
              setPressedSlug(s.slug);
              window.setTimeout(() => {
                triggerLightTapFeedback(e);
                onPrewarmSub(s.slug);
              }, 0);
            }}
            onPointerUp={(e) => clearPressed(e.currentTarget)}
            onPointerCancel={(e) => clearPressed(e.currentTarget)}
            onPointerLeave={(e) => clearPressed(e.currentTarget)}
            onClick={(e) => clearPressed(e.currentTarget)}
          >
            <span className={`${STORES_HOME_SUB_CATEGORY_ICON_WRAP} ${STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}`}>
              {src ?
                <StoreTaxonomyThumb
                  src={src}
                  alt=""
                  isUploaded
                  imgSize="fill"
                  frameClassName="h-full w-full"
                  loading={idx < STORES_HOME_TAXONOMY_EAGER_ICON_COUNT ? "eager" : "lazy"}
                />
              : (
                <span className="flex h-full w-full items-center justify-center bg-[color:var(--delivery-bg-muted)] text-[10px] font-semibold text-[color:var(--delivery-text-muted)]">
                  {label.slice(0, 2)}
                </span>
              )}
            </span>
            <span className={STORES_HOME_SUB_CATEGORY_LABEL}>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
