"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { ExchangeWriteForm } from "@/components/write/trade/ExchangeWriteForm";
import { JobsWriteForm } from "@/components/write/trade/JobsWriteForm";
import { TradeWriteForm } from "@/components/write/trade/TradeWriteForm";

export type TradeCategoryWriteFormProps = {
  category: CategoryWithSettings;
  onSuccess: (postId: string) => void;
  onCancel: () => void;
  suppressTier1Chrome?: boolean;
  /** 거래 시트·`/write` — 초안 있으면 이탈 확인 */
  onMeaningfulTradeDraftChange?: (has: boolean) => void;
  editPostId?: string;
  ownerEditSnapshot?: OwnerEditPostSnapshot;
  tradePolicy?: TradePolicyClient | null;
};

/** 신규 일자리형 거래 메뉴를 분기에 넣을 때 사용 */
export function resolveUsesJobsTradeWriteForm(category: CategoryWithSettings): boolean {
  return category.icon_key === "jobs" || category.icon_key === "job";
}

/** 신규 환전형 거래 메뉴를 분기에 넣을 때 사용 (`slug === "current"` 포함) */
export function resolveUsesExchangeTradeWriteForm(category: CategoryWithSettings): boolean {
  return (
    category.icon_key === "exchange" ||
    category.slug === "exchange" ||
    category.slug === "current"
  );
}

/**
 * 거래 타입(`trade`) 카테고리 → 작성 폼 단일 진입점.
 *
 * - **`/write` 풀페이지** · **거래 글쓰기 시트** · **상품 수정** 이 세 곳 모두 이 컴포넌트만 쓰도록 유지한다.
 * - 전용 폼이 필요하면 여기에 분기 추가 후 `discardTradeWriteStashedDraft`(`trade-write-exit-cleanup.ts`)에 저장소 정리를 등록한다.
 */
export function TradeCategoryWriteForm({
  category,
  onSuccess,
  onCancel,
  suppressTier1Chrome,
  onMeaningfulTradeDraftChange,
  editPostId,
  ownerEditSnapshot,
  tradePolicy,
}: TradeCategoryWriteFormProps) {
  if (resolveUsesJobsTradeWriteForm(category)) {
    return (
      <JobsWriteForm
        category={category}
        onSuccess={onSuccess}
        onCancel={onCancel}
        suppressTier1Chrome={suppressTier1Chrome}
        onMeaningfulTradeDraftChange={onMeaningfulTradeDraftChange}
        editPostId={editPostId}
        ownerEditSnapshot={ownerEditSnapshot}
        tradePolicy={tradePolicy}
      />
    );
  }
  if (resolveUsesExchangeTradeWriteForm(category)) {
    return (
      <ExchangeWriteForm
        category={category}
        onSuccess={onSuccess}
        onCancel={onCancel}
        suppressTier1Chrome={suppressTier1Chrome}
        onMeaningfulTradeDraftChange={onMeaningfulTradeDraftChange}
        editPostId={editPostId}
        ownerEditSnapshot={ownerEditSnapshot}
        tradePolicy={tradePolicy}
      />
    );
  }
  return (
    <TradeWriteForm
      category={category}
      onSuccess={onSuccess}
      onCancel={onCancel}
      suppressTier1Chrome={suppressTier1Chrome}
      onMeaningfulTradeDraftChange={onMeaningfulTradeDraftChange}
      editPostId={editPostId}
      ownerEditSnapshot={ownerEditSnapshot}
      tradePolicy={tradePolicy}
    />
  );
}
