"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CompositionAttributeFilterSelects } from "@/components/search/CompositionAttributeFilterSelects";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay/DibayOverlayActions";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories } from "@/lib/categories/getChildCategories";
import { resolveTradeCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  resolveCompositionAttributeFilterFields,
  resolveTradeCompositionForCategory,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  advanceMarketplaceMoreBrowseStep,
  buildMarketplaceMoreBrowseHref,
  marketplaceMoreBrowseHasFilterOptions,
  retreatMarketplaceMoreBrowseStep,
  type MarketplaceMoreBrowseStep,
} from "@/lib/trade/tabs/marketplace-more-browse";

type Props = {
  open: boolean;
  onClose: () => void;
  topics: CategoryWithSettings[];
  baseSearch: string;
  onApply: (href: string, tabKey: string) => void;
};

function topicLabel(
  language: AppLanguageCode,
  category: CategoryWithSettings
): string {
  return resolveTradeCategoryUILabel(
    language,
    category.name,
    category.name_en,
    category.slug,
    category.icon_key
  );
}

export function MarketplaceMoreBrowseSheet({
  open,
  onClose,
  topics,
  baseSearch,
  onApply,
}: Props) {
  const { language, t, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [step, setStep] = useState<MarketplaceMoreBrowseStep>("topic");
  const [root, setRoot] = useState<CategoryWithSettings | null>(null);
  const [child, setChild] = useState<CategoryWithSettings | null | "all">(null);
  const [children, setChildren] = useState<CategoryWithSettings[]>([]);
  const [filters, setFilters] = useState<CompositionFilterSelection>({});
  const [loadingChildren, setLoadingChildren] = useState(false);
  const pickGen = useRef(0);

  useEffect(() => {
    pickGen.current += 1;
    if (!open) return;
    setStep("topic");
    setRoot(null);
    setChild(null);
    setChildren([]);
    setFilters({});
    setLoadingChildren(false);
  }, [open]);

  const composition = useMemo(
    () => (root ? resolveTradeCompositionForCategory(root) : null),
    [root]
  );
  const filterFieldCount = composition
    ? resolveCompositionAttributeFilterFields(composition).length
    : 0;

  const title = (() => {
    if (step === "category") {
      return safeT("marketplace_more_browse_category_title", {
        fallbackKo: "카테고리",
        fallbackEn: "Category",
      });
    }
    if (step === "options") {
      return safeT("marketplace_more_browse_options_title", {
        fallbackKo: "품목 옵션",
        fallbackEn: "Item options",
      });
    }
    return safeT("marketplace_more_browse_topic_title", {
      fallbackKo: "주제",
      fallbackEn: "Topic",
    });
  })();

  const pickTopic = (category: CategoryWithSettings) => {
    const gen = ++pickGen.current;
    setRoot(category);
    setChild(null);
    setFilters({});
    setLoadingChildren(true);
    void getChildCategories(category.id)
      .then((list) => {
        if (gen !== pickGen.current) return;
        setChildren(list);
        setLoadingChildren(false);
        setStep(
          advanceMarketplaceMoreBrowseStep({
            from: "topic",
            childCount: list.length,
            hasFilterOptions: marketplaceMoreBrowseHasFilterOptions(category),
          })
        );
      })
      .catch(() => {
        if (gen !== pickGen.current) return;
        setChildren([]);
        setLoadingChildren(false);
        setStep(
          advanceMarketplaceMoreBrowseStep({
            from: "topic",
            childCount: 0,
            hasFilterOptions: marketplaceMoreBrowseHasFilterOptions(category),
          })
        );
      });
  };

  const pickChild = (next: CategoryWithSettings | null) => {
    if (!root) return;
    setChild(next ?? "all");
    setStep(
      advanceMarketplaceMoreBrowseStep({
        from: "category",
        childCount: children.length,
        hasFilterOptions: marketplaceMoreBrowseHasFilterOptions(root),
      })
    );
  };

  const goBack = () => {
    setStep(
      retreatMarketplaceMoreBrowseStep({
        from: step,
        childCount: children.length,
      })
    );
  };

  const apply = () => {
    if (!root) return;
    const topicKey =
      child && child !== "all" ? (child.slug?.trim() || child.id) : null;
    const href = buildMarketplaceMoreBrowseHref({
      categoryId: root.id,
      topic: topicKey,
      filters,
      baseSearch,
      compositionOwner: root,
    });
    onApply(href, root.id);
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={title}
      ariaLabel={title}
      footer={
        <div className={OverlayUi.actionsRow}>
          <DibayOverlayButton roleTone="secondary" onClick={onClose}>
            {t("common_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="primary"
            disabled={!root || loadingChildren}
            data-marketplace-more-browse-apply="true"
            onClick={apply}
          >
            {safeT("marketplace_more_browse_apply", {
              fallbackKo: "적용",
              fallbackEn: "Apply",
            })}
          </DibayOverlayButton>
        </div>
      }
    >
      <div data-marketplace-more-browse="true" data-marketplace-more-browse-step={step}>
        {step !== "topic" ? (
          <div className="mb-2">
            <DibayOverlayButton roleTone="text" onClick={goBack}>
              {safeT("marketplace_more_browse_back", {
                fallbackKo: "이전",
                fallbackEn: "Back",
              })}
            </DibayOverlayButton>
          </div>
        ) : null}

        {step === "topic" ? (
          <div className={OverlayUi.actionSheetList}>
            {topics.map((category) => (
              <button
                key={category.id}
                type="button"
                className={OverlayUi.actionSheetItem}
                onClick={() => pickTopic(category)}
              >
                {topicLabel(lang, category)}
              </button>
            ))}
          </div>
        ) : null}

        {step === "category" ? (
          <div className={OverlayUi.actionSheetList}>
            <button
              type="button"
              className={OverlayUi.actionSheetItem}
              onClick={() => pickChild(null)}
            >
              {safeT("marketplace_more_browse_all_in_topic", {
                fallbackKo: "이 주제 전체",
                fallbackEn: "All in this topic",
              })}
            </button>
            {children.map((category) => (
              <button
                key={category.id}
                type="button"
                className={OverlayUi.actionSheetItem}
                onClick={() => pickChild(category)}
              >
                {topicLabel(lang, category)}
              </button>
            ))}
          </div>
        ) : null}

        {step === "options" ? (
          filterFieldCount > 0 ? (
            <div className="flex flex-col gap-2">
              <CompositionAttributeFilterSelects
                composition={composition}
                selection={filters}
                onChange={setFilters}
              />
            </div>
          ) : (
            <p className={OverlayUi.bodySecondary}>
              {safeT("marketplace_more_browse_options_empty", {
                fallbackKo: "이 주제에 고를 품목 옵션이 없습니다. 적용을 누르면 목록을 봅니다.",
                fallbackEn: "No item options for this topic. Apply to see listings.",
              })}
            </p>
          )
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
