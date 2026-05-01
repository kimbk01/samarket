"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import {
  discardTradeWriteStashedDraft,
  TRADE_WRITE_EXIT_SHEET_BODY,
  TRADE_WRITE_EXIT_SHEET_TITLE,
} from "@/lib/posts/trade-write-exit-cleanup";

const CATEGORY_CHANGE_SHEET_TITLE = "카테고리를 변경할까요?";
const CATEGORY_CHANGE_SHEET_BODY = "현재 입력한 내용이 사라질 수 있습니다.";
import { getCategories } from "@/lib/categories/getCategories";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getUnifiedWriteHref } from "@/lib/categories/getCategoryHref";
import { type CategoryWithSettings } from "@/lib/types/category";
import { ensureClientAccessOrRedirectAsync } from "@/lib/auth/client-access-flow";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";
import { TradeCategoryWriteForm } from "@/components/write/trade/TradeCategoryWriteForm";
import { CommunityWriteForm } from "@/components/write/community/CommunityWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";
import { APP_TRADE_WRITE_HORIZONTAL_CLASS } from "@/lib/ui/app-content-layout";

export type WriteSheetFlowMode = "page" | "tradeSheet";

export type WriteSheetFlowInnerProps = {
  mode: WriteSheetFlowMode;
  /** `/write?category=` 값과 동일한 키(거래는 UUID) */
  categoryKey: string;
  /** tradeSheet: 부모가 `categoryKey`를 갱신 — 피드 URL은 그대로 */
  onTradeSheetCategoryChange?: (next: string) => void;
  /** `ensureClientAccessOrRedirectAsync` 용 */
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

  useEffect(() => {
    getCategories({ activeOnly: true }).then(setCategories);
  }, []);

  const byType = useMemo(
    () => ({
      trade: categories.filter((x) => x.type === "trade"),
      service: categories.filter((x) => x.type === "service"),
      community: categories.filter((x) => x.type === "community"),
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

  const loadSelectedCategory = useCallback(
    async (value: string) => {
      if (!value) {
        setSelectedCategory(null);
        setFormStatus("idle");
        return;
      }
      if (!(await ensureClientAccessOrRedirectAsync(router, pathnameForAuth || "/write"))) {
        setSelectedCategory(null);
        setFormStatus("redirecting");
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
    [router, pathnameForAuth]
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
      onTierSubtitleChange(selectedCategory.name);
    } else {
      onTierSubtitleChange(undefined);
    }
  }, [categoryKey, formStatus, onTierSubtitleChange, selectedCategory]);

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

  const renderWriteForm = () => {
    if (formStatus === "loading") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">불러오는 중…</p>;
    }
    if (formStatus === "redirecting") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">권한 확인 중…</p>;
    }
    if (formStatus === "not_found") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">카테고리를 찾을 수 없습니다.</p>;
    }
    if (formStatus === "no_write") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">이 카테고리에는 글을 쓸 수 없습니다.</p>;
    }
    if (formStatus !== "found" || !selectedCategory) return null;

    switch (selectedCategory.type) {
      case "trade":
        return (
          <TradeCategoryWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={tryClose}
            suppressTier1Chrome
            onMeaningfulTradeDraftChange={setMeaningfulTradeDraft}
          />
        );
      case "community":
        return (
          <CommunityWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={tryClose}
            suppressTier1Chrome
          />
        );
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
        return <p className="py-10 text-center sam-text-body text-sam-muted">지원하지 않는 카테고리 타입입니다.</p>;
    }
  };

  return (
    <>
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        onCancel={handleLeaveCancel}
        title={TRADE_WRITE_EXIT_SHEET_TITLE}
        description={TRADE_WRITE_EXIT_SHEET_BODY}
        cancelLabel="계속 작성"
        confirmLabel="나가기"
        confirmTone="primary"
        onConfirm={handleLeaveConfirm}
        zIndexClass={mode === "tradeSheet" ? "z-[66]" : "z-[60]"}
        ariaLabel="글쓰기 나가기 확인"
        interactionMode="blocking"
      />
      <MobileConfirmBottomSheet
        open={categoryChangeOpen}
        onCancel={handleCategoryChangeCancel}
        title={CATEGORY_CHANGE_SHEET_TITLE}
        description={CATEGORY_CHANGE_SHEET_BODY}
        cancelLabel="취소"
        confirmLabel="변경"
        confirmTone="danger"
        onConfirm={handleCategoryChangeConfirm}
        zIndexClass={mode === "tradeSheet" ? "z-[66]" : "z-[60]"}
        ariaLabel="카테고리 변경 확인"
        interactionMode="blocking"
      />
    <div
      className={`${APP_TRADE_WRITE_HORIZONTAL_CLASS} space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3`}
    >
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <label
          htmlFor="write-category-select"
          className="mb-2 block sam-text-body font-semibold text-sam-fg"
        >
          카테고리를 선택하세요
        </label>
        <select
          id="write-category-select"
          value={categoryKey.trim()}
          onChange={(e) => handleDropdownChange(e.target.value)}
          className="h-11 w-full rounded-sam-md border border-sam-border bg-white px-3 sam-text-body text-sam-fg outline-none focus:border-sam-primary"
          disabled={selectableCategories.length === 0}
        >
          <option value="">카테고리를 선택하세요</option>
          {selectableCategories.map((category) => (
            <option key={category.id} value={category.id} disabled={!category.settings?.can_write}>
              {category.name}
              {!category.settings?.can_write ? " (작성 불가)" : ""}
            </option>
          ))}
        </select>
      </div>
      {!categoryKey.trim() ? (
        <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
          <p className="py-10 text-center sam-text-body text-sam-muted">카테고리를 선택하세요</p>
        </div>
      ) : (
        <div
          className="min-w-0"
          onChangeCapture={markDirtyByFormInteraction}
          onInputCapture={markDirtyByFormInteraction}
        >
          {renderWriteForm()}
        </div>
      )}
    </div>
    </>
  );
}
