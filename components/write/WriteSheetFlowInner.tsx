"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getUnifiedWriteHref } from "@/lib/categories/getCategoryHref";
import { type CategoryWithSettings } from "@/lib/types/category";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import { TradeWriteForm } from "@/components/write/trade/TradeWriteForm";
import { JobsWriteForm } from "@/components/write/trade/JobsWriteForm";
import { ExchangeWriteForm } from "@/components/write/trade/ExchangeWriteForm";
import { CommunityWriteForm } from "@/components/write/community/CommunityWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";

export type WriteSheetFlowMode = "page" | "tradeSheet";

export type WriteSheetFlowInnerProps = {
  mode: WriteSheetFlowMode;
  /** `/write?category=` 값과 동일한 키(거래는 UUID) */
  categoryKey: string;
  /** tradeSheet: 부모가 `categoryKey`를 갱신 — 피드 URL은 그대로 */
  onTradeSheetCategoryChange?: (next: string) => void;
  /** `ensureClientAccessOrRedirect` 용 */
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
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithSettings | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
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
      const user = getCurrentUser();
      if (!ensureClientAccessOrRedirect(router, user, pathnameForAuth || "/write")) {
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

  const handleDropdownChange = useCallback(
    (value: string) => {
      const currentId = selectedCategory?.id ?? "";
      if (value === currentId) return;
      if (isFormDirty && selectedCategory) {
        const ok = window.confirm(
          "카테고리를 변경하면 현재 입력한 내용이 사라질 수 있습니다. 카테고리를 변경하시겠어요?"
        );
        if (!ok) return;
      }
      if (!value) {
        setIsFormDirty(false);
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
      if (mode === "tradeSheet") {
        onTradeSheetCategoryChange?.(selected.id);
      } else {
        handleSelect(selected);
      }
    },
    [
      categories,
      handleSelect,
      isFormDirty,
      mode,
      onTradeSheetCategoryChange,
      router,
      selectedCategory,
    ]
  );

  const tryClose = useCallback(() => {
    if (isFormDirty && selectedCategory) {
      const ok = window.confirm("작성 중인 내용이 있습니다. 취소하면 입력한 내용이 사라집니다. 닫으시겠어요?");
      if (!ok) return;
    }
    setIsFormDirty(false);
    onUserRequestClose();
  }, [isFormDirty, onUserRequestClose, selectedCategory]);

  useEffect(() => {
    if (!onExposeTryClose) return;
    onExposeTryClose(tryClose);
    return () => onExposeTryClose(() => {});
  }, [tryClose, onExposeTryClose]);

  useEffect(() => {
    if (mode !== "tradeSheet" || !onTradeSheetBlockingDraftChange) return;
    onTradeSheetBlockingDraftChange(isFormDirty);
    return () => onTradeSheetBlockingDraftChange(false);
  }, [mode, isFormDirty, onTradeSheetBlockingDraftChange]);

  const handleSuccess = useCallback(
    (postId: string) => {
      if (!selectedCategory) return;
      setIsFormDirty(false);
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
        if (selectedCategory.icon_key === "jobs" || selectedCategory.icon_key === "job") {
          return (
            <JobsWriteForm
              category={selectedCategory}
              onSuccess={handleSuccess}
              onCancel={tryClose}
              suppressTier1Chrome
            />
          );
        }
        if (
          selectedCategory.icon_key === "exchange" ||
          selectedCategory.slug === "exchange" ||
          selectedCategory.slug === "current"
        ) {
          return (
            <ExchangeWriteForm
              category={selectedCategory}
              onSuccess={handleSuccess}
              onCancel={tryClose}
              suppressTier1Chrome
            />
          );
        }
        return (
          <TradeWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={tryClose}
            suppressTier1Chrome
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
    <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <label
          htmlFor="write-category-select"
          className="mb-2 block sam-text-body-secondary font-semibold text-[#666666]"
        >
          카테고리 선택
        </label>
        <select
          id="write-category-select"
          value={selectedCategory?.id ?? ""}
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
      {!categoryKey ? (
        <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
          <p className="px-4 py-10 text-center sam-text-body text-sam-muted">카테고리를 선택 하세요</p>
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
  );
}
