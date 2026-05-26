import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  buildStoresHomeCategorySeedPanelModel,
  STORES_HOME_CATEGORY_SSR_SEED_ID,
} from "@/lib/stores/stores-home-category-seed-panel-model";
import {
  STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY,
  STORES_HOME_SUB_CATEGORY_SECTION_BODY,
  STORES_HOME_SUB_CATEGORY_SLIDE_LAYER,
  STORES_HOME_SUB_CATEGORY_SLIDE_STAGE,
} from "@/lib/stores/stores-home-ui";
import { StoresHomePrimaryCategoryRailView } from "@/components/stores/home/hub/stores-home-primary-category-rail-view";
import { StoresHomeSubCategoryRailView } from "@/components/stores/home/hub/stores-home-sub-category-rail-view";

/**
 * CONTRACT — `/stores` 카테고리 표시 전용 SSR. 이벤트·상태 없음.
 * hydration 전 `data-stores-perf="category"` 가 HTML에 포함된다.
 */
export function StoresHomeCategorySeedPanelServer({ language }: { language: AppLanguageCode }) {
  const model = buildStoresHomeCategorySeedPanelModel(language);
  if (model.subs.length === 0) return null;

  return (
    <div id={STORES_HOME_CATEGORY_SSR_SEED_ID} className="stores-home-category-ssr-seed">
      <section
        className={STORES_HOME_SUB_CATEGORY_SECTION_BODY}
        aria-label="store sub categories"
        data-stores-perf="category"
      >
        <div className={STORES_HOME_SUB_CATEGORY_SLIDE_STAGE}>
          <div className={STORES_HOME_SUB_CATEGORY_SLIDE_LAYER}>
            <StoresHomeSubCategoryRailView items={model.subs} />
          </div>
        </div>
      </section>
      {model.primaries.length > 0 ?
        <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY}>
          <StoresHomePrimaryCategoryRailView items={model.primaries} ariaLabel={model.primaryAriaLabel} />
        </div>
      : null}
    </div>
  );
}
