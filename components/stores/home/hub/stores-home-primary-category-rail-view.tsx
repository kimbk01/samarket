import {
  STORE_TAXONOMY_THUMB_FRAME,
  storeTaxonomyThumbImgClass,
} from "@/lib/stores/store-taxonomy-thumbnail-ui";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import type { StoresHomePrimaryCategorySeedItem } from "@/lib/stores/stores-home-category-seed-panel-model";
import {
  STORES_HOME_PRIMARY_CATEGORY_ICON_INNER,
  STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED,
  STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY,
  STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE,
} from "@/lib/stores/stores-home-ui";

/** 1차 업종 rail — SSR 표시 전용(탭 인터랙션 없음) */
export function StoresHomePrimaryCategoryRailView({
  items,
  ariaLabel,
}: {
  items: StoresHomePrimaryCategorySeedItem[];
  ariaLabel: string;
}) {
  return (
    <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY}>
      <div className={STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED} role="tablist" aria-label={ariaLabel}>
        {items.map((p, index) => {
          const on = p.selected;
          return (
            <div
              key={p.id}
              role="tab"
              aria-selected={on}
              tabIndex={-1}
              className={STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON}
            >
              {p.src ?
                <span className={STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT}>
                  <span
                    className={`${STORE_TAXONOMY_THUMB_FRAME} ${STORES_HOME_PRIMARY_CATEGORY_ICON_INNER} ${
                      on ? "scale-110" : "scale-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt=""
                      className={storeTaxonomyThumbImgClass(p.isUploaded, "fill")}
                      loading={index < STORES_HOME_TAXONOMY_EAGER_ICON_COUNT ? "eager" : "lazy"}
                      decoding="async"
                    />
                  </span>
                </span>
              : null}
              <span className={on ? STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED : STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE}>
                {p.label}
              </span>
              <span
                className={on ? STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR : STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
