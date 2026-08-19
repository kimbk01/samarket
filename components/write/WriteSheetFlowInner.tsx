"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { discardTradeWriteStashedDraft } from "@/lib/posts/trade-write-exit-cleanup";
import { resolveWriteCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";

import { getCategories } from "@/lib/categories/getCategories";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { getUnifiedWriteHref, getCanonicalCommunityWriteHref } from "@/lib/categories/getCategoryHref";
import { type CategoryWithSettings } from "@/lib/types/category";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { TradeCategoryWriteForm } from "@/components/write/trade/TradeCategoryWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";
import { ImageUploader, type ImageUploadItem } from "@/components/write/shared/ImageUploader";
import { SubmitButton } from "@/components/write/shared/SubmitButton";
import { APP_TRADE_WRITE_HORIZONTAL_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_WRITE_SELECT_CLASS } from "@/lib/ui/philife-write-fb-ui";
import {
  TRADE_WRITE_FB_CONTROL,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_WRITE_FB_SECTION,
} from "@/lib/ui/trade-write-fb-ui";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

export type WriteSheetFlowMode = "page" | "tradeSheet";

export type WriteSheetFlowInnerProps = {
  mode: WriteSheetFlowMode;
  /** `/write?category=` 값과 동일한 키(거래는 UUID) */
  categoryKey: string;
  /** tradeSheet: 부모가 `categoryKey`를 갱신 — 피드 URL은 그대로 */
  onTradeSheetCategoryChange?: (next: string) => void;
  /** `requireAuthAction` 용 복귀 경로 */
  pathnameForAuth: string;
  onUserRequestClose: () => void;
  onSuccessNavigate: (category: CategoryWithSettings, postId: string) => void;
  /** `/write` 1단 부제 — 로드된 카테고리명 동기화 */
  onTierSubtitleChange?: (subtitle: string | undefined) => void;
  /** `/write` 뒤로/닫기 — `WriteScreenTier1Sync` 가 동일한 이탈 확인(더티)을 쓰도록 */
  onExposeTryClose?: (fn: () => void) => void;
  /** tradeSheet: 메신저 등 다른 풀오버 전 이탈 확인용 */
  onTradeSheetBlockingDraftChange?: (hasDraft: boolean) => void;
};

/**
 * `/write` 풀페이지·거래 피드 글쓰기 시트 공통 — 카테고리 선택 + 타입별 폼.
 */
export function WriteSheetFlowInner({
  mode,
  categoryKey,
  onTradeSheetCategoryChange,
  pathnameForAuth,
  onUserRequestClose,
  onSuccessNavigate,
  onTierSubtitleChange,
  onExposeTryClose,
  onTradeSheetBlockingDraftChange,
}: WriteSheetFlowInnerProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const tradeWriteSheetCtx = useTradeWriteSheetOptional();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithSettings | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  /** 거래 타입 전체(Trade·Jobs·Exchange) — 입력·임시저장·지도 복원 기준 의미 있는 초안 */
  const [meaningfulTradeDraft, setMeaningfulTradeDraft] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [categoryChangeOpen, setCategoryChangeOpen] = useState(false);
  const [pendingCategoryValue, setPendingCategoryValue] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<
    "idle" | "redirecting" | "loading" | "found" | "not_found" | "no_write"
  >("idle");
  const [pendingImages, setPendingImages] = useState<ImageUploadItem[]>([]);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingDescription, setPendingDescription] = useState("");

  const categoryUiLabel = useCallback(
    (category: CategoryWithSettings) => resolveWriteCategoryUILabel(language, category),
    [language]
  );

  useEffect(() => {
    getCategories({ activeOnly: true }).then(setCategories);
  }, []);

  const byType = useMemo(
    () => ({
      trade: categories.filter((x) => x.type === "trade"),
      service: categories.filter((x) => x.type === "service"),
      // community: product write is /philife/write only — exclude legacy sheet path
      feature: categories.filter((x) => x.type === "feature"),
    }),
    [categories]
  );
  const selectableCategories = useMemo(
    () =>
      (Object.keys(byType) as Array<keyof typeof byType>).flatMap((type) =>
        byType[type].map((category) => category)
      ),
    [byType]
  );

  const redirectCommunityWriteToCanonical = useCallback(() => {
    setSelectedCategory(null);
    setFormStatus("redirecting");
    if (mode === "tradeSheet") {
      onUserRequestClose();
    }
    router.replace(getCanonicalCommunityWriteHref());
  }, [mode, onUserRequestClose, router]);

  const loadSelectedCategory = useCallback(
    async (value: string) => {
      if (!value) {
        setSelectedCategory(null);
        setFormStatus("idle");
        return;
      }
      const v = value.trim();
      const n = normalizeMarketSlugParam(v);
      const fromList = categories.find(
        (c) => c.id === v || c.id === n || (c.slug && (c.slug === v || c.slug === n))
      );
      if (fromList) {
        if (fromList.type === "community") {
          redirectCommunityWriteToCanonical();
          return;
        }
        const profileOk = await requireAuthAction("trade_create_item", async () => {}, {
          next: pathnameForAuth || "/write",
        });
        if (!profileOk) {
          setSelectedCategory(null);
          setFormStatus("redirecting");
          return;
        }
        if (fromList.settings && !fromList.settings.can_write) {
          setSelectedCategory(fromList);
          setFormStatus("no_write");
          return;
        }
        setSelectedCategory(fromList);
        setFormStatus("found");
        return;
      }
      setFormStatus("loading");
      try {
        const c = await getCategoryBySlugOrId(value);
        if (!c) {
          setSelectedCategory(null);
          setFormStatus("not_found");
          return;
        }
        if (c.type === "community") {
          redirectCommunityWriteToCanonical();
          return;
        }
        const profileOk = await requireAuthAction("trade_create_item", async () => {}, {
          next: pathnameForAuth || "/write",
        });
        if (!profileOk) {
          setSelectedCategory(null);
          setFormStatus("redirecting");
          return;
        }
        if (c.settings && !c.settings.can_write) {
          setSelectedCategory(c);
          setFormStatus("no_write");
          return;
        }
        setSelectedCategory(c);
        setFormStatus("found");
      } catch {
        setSelectedCategory(null);
        setFormStatus("not_found");
      }
    },
    [pathnameForAuth, categories, redirectCommunityWriteToCanonical]
  );

  useEffect(() => {
    void loadSelectedCategory(categoryKey);
  }, [categoryKey, loadSelectedCategory]);

  useEffect(() => {
    if (!categoryKey.trim()) setMeaningfulTradeDraft(false);
  }, [categoryKey]);

  useEffect(() => {
    if (!onTierSubtitleChange) return;
    if (categoryKey && formStatus === "found" && selectedCategory) {
      onTierSubtitleChange(categoryUiLabel(selectedCategory));
    } else {
      onTierSubtitleChange(undefined);
    }
  }, [categoryKey, formStatus, onTierSubtitleChange, selectedCategory, categoryUiLabel]);

  const handleSelect = useCallback(
    (c: CategoryWithSettings) => {
      if (!c.settings?.can_write) return;
      router.push(getUnifiedWriteHref(c));
    },
    [router]
  );

  const applyCategoryChange = useCallback(
    (value: string) => {
      const currentId = categoryKey.trim();
      if (value === currentId) return;
      const nextId = value.trim();
      /** 다른 거래 카테고리로 바꿀 때만 초안 폐기. 빈 값(미선택)으로만 돌아가는 것은 나가기와 동일하게 해당 카테고리 초안 유지 */
      if (nextId && selectedCategory?.type === "trade" && nextId !== currentId) {
        discardTradeWriteStashedDraft(selectedCategory.id);
      }
      if (!value) {
        setIsFormDirty(false);
        setMeaningfulTradeDraft(false);
        if (mode === "tradeSheet") {
          onTradeSheetCategoryChange?.("");
        } else {
          router.push("/write");
        }
        return;
      }
      const selected = categories.find((c) => c.id === value);
      if (!selected || !selected.settings?.can_write) return;
      if (selected.type === "community") {
        redirectCommunityWriteToCanonical();
        return;
      }
      setIsFormDirty(false);
      setMeaningfulTradeDraft(false);
      if (mode === "tradeSheet") {
        onTradeSheetCategoryChange?.(selected.id);
      } else {
        handleSelect(selected);
      }
    },
    [
      categories,
      categoryKey,
      handleSelect,
      mode,
      onTradeSheetCategoryChange,
      redirectCommunityWriteToCanonical,
      router,
      selectedCategory,
    ]
  );

  const handleDropdownChange = useCallback(
    (value: string) => {
      const currentId = categoryKey.trim();
      if (value === currentId) return;
      const needsCatChangeConfirm =
        selectedCategory &&
        (isFormDirty || (selectedCategory.type === "trade" && meaningfulTradeDraft));
      if (needsCatChangeConfirm) {
        setPendingCategoryValue(value);
        setCategoryChangeOpen(true);
        return;
      }
      applyCategoryChange(value);
    },
    [
      applyCategoryChange,
      categoryKey,
      isFormDirty,
      meaningfulTradeDraft,
      selectedCategory,
    ]
  );

  const handleCategoryChangeConfirm = useCallback(() => {
    setCategoryChangeOpen(false);
    const value = pendingCategoryValue ?? "";
    setPendingCategoryValue(null);
    applyCategoryChange(value);
  }, [applyCategoryChange, pendingCategoryValue]);

  const handleCategoryChangeCancel = useCallback(() => {
    setCategoryChangeOpen(false);
    setPendingCategoryValue(null);
  }, []);

  const tryClose = useCallback(() => {
    const shouldConfirm =
      selectedCategory &&
      (isFormDirty || (selectedCategory.type === "trade" && meaningfulTradeDraft));
    if (shouldConfirm) {
      setLeaveConfirmOpen(true);
      return;
    }
    void (async () => {
      if (selectedCategory?.type === "trade") {
        try {
          await tradeWriteSheetCtx?.persistSnapshotBeforeLeaveRef.current?.();
        } catch {
          /* 스냅샷 실패해도 닫기 진행 */
        }
      }
      setIsFormDirty(false);
      setMeaningfulTradeDraft(false);
      onUserRequestClose();
    })();
  }, [
    isFormDirty,
    meaningfulTradeDraft,
    onUserRequestClose,
    selectedCategory,
    tradeWriteSheetCtx,
  ]);

  const handleLeaveConfirm = useCallback(() => {
    setLeaveConfirmOpen(false);
    setIsFormDirty(false);
    setMeaningfulTradeDraft(false);
    void (async () => {
      try {
        await tradeWriteSheetCtx?.persistSnapshotBeforeLeaveRef.current?.();
      } catch {
        /* 스냅샷 실패해도 닫기 진행 */
      }
      onUserRequestClose();
    })();
  }, [onUserRequestClose, tradeWriteSheetCtx]);

  const handleLeaveCancel = useCallback(() => setLeaveConfirmOpen(false), []);

  useEffect(() => {
    if (!onExposeTryClose) return;
    onExposeTryClose(tryClose);
    return () => onExposeTryClose(() => {});
  }, [tryClose, onExposeTryClose]);

  useEffect(() => {
    if (mode !== "tradeSheet" || !onTradeSheetBlockingDraftChange) return;
    const tradeBlocking =
      selectedCategory?.type === "trade" ? isFormDirty || meaningfulTradeDraft : isFormDirty;
    onTradeSheetBlockingDraftChange(tradeBlocking);
    return () => onTradeSheetBlockingDraftChange(false);
  }, [mode, isFormDirty, meaningfulTradeDraft, onTradeSheetBlockingDraftChange, selectedCategory?.type]);

  const handleSuccess = useCallback(
    (postId: string) => {
      if (!selectedCategory) return;
      setIsFormDirty(false);
      setMeaningfulTradeDraft(false);
      onSuccessNavigate(selectedCategory, postId);
    },
    [onSuccessNavigate, selectedCategory]
  );

  const markDirtyByFormInteraction = useCallback((event: React.SyntheticEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.id === "write-category-select") return;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      setIsFormDirty(true);
    }
  }, []);

  const rootTopicSelect = (
    <section data-ui3-write-root="true" className={TRADE_WRITE_FB_SECTION}>
      <label htmlFor="write-category-select" className={TRADE_WRITE_FB_FIELD_HEAD}>
        {t("ui_write_select_category")}
      </label>
      <select
        id="write-category-select"
        value={categoryKey.trim()}
        onChange={(e) => handleDropdownChange(e.target.value)}
        className={PHILIFE_WRITE_SELECT_CLASS}
        disabled={selectableCategories.length === 0}
      >
        <option value="">{t("ui_write_select_category")}</option>
        {selectableCategories.map((category) => (
          <option key={category.id} value={category.id} disabled={!category.settings?.can_write}>
            {categoryUiLabel(category)}
            {!category.settings?.can_write ? t("ui_write_category_disabled_suffix") : ""}
          </option>
        ))}
      </select>
    </section>
  );

  const renderWriteForm = () => {
    if (formStatus === "loading") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
    }
    if (formStatus === "redirecting") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">{t("ui_write_auth_checking")}</p>;
    }
    if (formStatus === "not_found") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">{t("ui_category_not_found")}</p>;
    }
    if (formStatus === "no_write") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">{t("ui_product_edit_cannot_write_category")}</p>;
    }
    if (formStatus !== "found" || !selectedCategory) return null;

    switch (selectedCategory.type) {
      case "trade":
        return (
          <TradeCategoryWriteForm
            key={selectedCategory.id}
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={tryClose}
            suppressTier1Chrome
            onMeaningfulTradeDraftChange={setMeaningfulTradeDraft}
            rootTopicSelect={rootTopicSelect}
            listingChromeSeed={{
              images: pendingImages,
              title: pendingTitle,
              description: pendingDescription,
            }}
          />
        );
      case "community":
        // Legacy CommunityWriteForm isolated — product callers redirect to /philife/write
        return <p className="py-10 text-center sam-text-body text-sam-muted">{t("ui_write_auth_checking")}</p>;
      case "service":
        return (
          <ServiceWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={tryClose}
            suppressTier1Chrome
          />
        );
      case "feature":
        return <FeatureWriteBlock category={selectedCategory} onCancel={tryClose} suppressTier1Chrome />;
      default:
        return <p className="py-10 text-center sam-text-body text-sam-muted">{t("ui_write_unsupported_type")}</p>;
    }
  };

  return (
    <>
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        onCancel={handleLeaveCancel}
        title={t("ui_write_exit_title")}
        description={t("ui_write_exit_body")}
        cancelLabel={t("ui_write_exit_continue")}
        confirmLabel={t("ui_write_exit_confirm")}
        confirmTone="primary"
        onConfirm={handleLeaveConfirm}
        zIndexClass={mode === "tradeSheet" ? MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS : "z-[60]"}
        ariaLabel={t("ui_write_exit_aria")}
        interactionMode="blocking"
      />
      <MobileConfirmBottomSheet
        open={categoryChangeOpen}
        onCancel={handleCategoryChangeCancel}
        title={t("ui_write_category_change_title")}
        description={t("ui_write_category_change_body")}
        cancelLabel={t("ui_write_category_change_cancel")}
        confirmLabel={t("ui_write_category_change_confirm")}
        confirmTone="danger"
        onConfirm={handleCategoryChangeConfirm}
        zIndexClass={mode === "tradeSheet" ? MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS : "z-[60]"}
        ariaLabel={t("ui_write_category_change_aria")}
        interactionMode="blocking"
      />
    <div
      className={`${APP_TRADE_WRITE_HORIZONTAL_CLASS} space-y-0 pb-[max(1.25rem,var(--safe-bottom))] pt-3`}
    >
      {selectedCategory?.type === "trade" && formStatus === "found" ? (
        <div
          className="min-w-0"
          onChangeCapture={markDirtyByFormInteraction}
          onInputCapture={markDirtyByFormInteraction}
        >
          {renderWriteForm()}
        </div>
      ) : !categoryKey.trim() ? (
        <div data-ui3-write-ungated="true" className="min-w-0">
          <div data-ui3-slot="photos">
            <ImageUploader
              value={pendingImages}
              onChange={setPendingImages}
              maxCount={10}
              label={t("trade_write_photos")}
              compact={false}
              variant="karrot"
            />
          </div>
          <section data-ui3-slot="title" className={TRADE_WRITE_FB_SECTION}>
            <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_write_title")}</h4>
            <input
              type="text"
              value={pendingTitle}
              onChange={(e) => setPendingTitle(e.target.value)}
              maxLength={100}
              className={`mt-0.5 w-full ${TRADE_WRITE_FB_CONTROL}`}
            />
          </section>
          <section data-ui3-slot="price" className={TRADE_WRITE_FB_SECTION}>
            <label className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_write_price")}</label>
            <div className={`${TRADE_WRITE_FB_CONTROL} bg-sam-app text-sam-muted`}> </div>
          </section>
          <div data-ui3-slot="item">{rootTopicSelect}</div>
          <section data-ui3-slot="description" className={TRADE_WRITE_FB_SECTION}>
            <h4 className={TRADE_WRITE_FB_FIELD_HEAD}>{t("trade_write_content")}</h4>
            <textarea
              value={pendingDescription}
              onChange={(e) => setPendingDescription(e.target.value)}
              className={`mt-0.5 min-h-[100px] w-full ${TRADE_WRITE_FB_CONTROL}`}
            />
          </section>
          <div data-ui3-slot="submit">
            <SubmitButton label={t("trade_write_submit")} disabled onCancel={onUserRequestClose} />
          </div>
        </div>
      ) : (
        <>
          {selectedCategory?.type === "service" || selectedCategory?.type === "feature" || !selectedCategory
            ? rootTopicSelect
            : null}
          <div
            className="min-w-0"
            onChangeCapture={markDirtyByFormInteraction}
            onInputCapture={markDirtyByFormInteraction}
          >
            {renderWriteForm()}
          </div>
        </>
      )}
    </div>
    </>
  );
}
