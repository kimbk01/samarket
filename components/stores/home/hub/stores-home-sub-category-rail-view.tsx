import {
  STORE_TAXONOMY_THUMB_FRAME,
  storeTaxonomyThumbImgClass,
} from "@/lib/stores/store-taxonomy-thumbnail-ui";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import type { StoresHomeSubCategorySeedItem } from "@/lib/stores/stores-home-category-seed-panel-model";
import {
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
  STORES_HOME_SUB_CATEGORY_RAIL,
} from "@/lib/stores/stores-home-ui";

/** 2차 업종 rail — SSR·client 공통 마크업 (이벤트 없음) */
export function StoresHomeSubCategoryRailView({
  items,
  linkComponent: LinkTag = "a",
}: {
  items: StoresHomeSubCategorySeedItem[];
  linkComponent?: "a" | "span";
}) {
  return (
    <div className={STORES_HOME_SUB_CATEGORY_RAIL}>
      {items.map((item, idx) => {
        const inner = (
          <>
            <span className={STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}>
              <span className={`${STORE_TAXONOMY_THUMB_FRAME} h-full w-full`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt=""
                  className={storeTaxonomyThumbImgClass(item.isUploaded, "fill")}
                  loading={idx < STORES_HOME_TAXONOMY_EAGER_ICON_COUNT ? "eager" : "lazy"}
                  decoding="async"
                />
              </span>
            </span>
            <span className={STORES_HOME_SUB_CATEGORY_LABEL}>{item.label}</span>
          </>
        );
        if (LinkTag === "a") {
          return (
            <a
              key={item.id}
              href={item.href}
              className={STORES_HOME_SUB_CATEGORY_LINK}
              aria-label={item.label}
            >
              {inner}
            </a>
          );
        }
        return (
          <span key={item.id} className={STORES_HOME_SUB_CATEGORY_LINK} aria-label={item.label}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
