"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import type { ReactNode } from "react";
import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
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
  rootTopicSelect?: ReactNode;
  listingChromeSeed?: {
    images: ImageUploadItem[];
    title: string;
    description: string;
  };
};

/** @deprecated import from `@/lib/trade/category-form/write-form-profile` */
export {
  resolveUsesJobsTradeWriteForm,
  resolveUsesExchangeTradeWriteForm,
} from "@/lib/trade/category-form/write-form-profile";

/**
 * 거래 타입(`trade`) 카테고리 → 작성 폼 단일 진입점.
 *
 * - `/write` · 거래 시트 · 상품 수정 모두 이 컴포넌트만 사용한다.
 * - DO NOT: 여기에 Jobs/Exchange/중고차 WriteModule 분기를 추가하지 않는다.
 * - 신규 카테고리 = Field Library + Composition seed (+ Admin overlay).
 * - Jobs/Exchange 레거시 레이아웃은 `TradeWriteForm` 내부에서만 마운트한다.
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
  rootTopicSelect,
  listingChromeSeed,
}: TradeCategoryWriteFormProps) {
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
      rootTopicSelect={rootTopicSelect}
      listingChromeSeed={listingChromeSeed}
    />
  );
}
