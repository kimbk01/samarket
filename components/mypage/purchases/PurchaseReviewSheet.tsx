"use client";

import { TradeReviewForm } from "@/components/trade/TradeReviewForm";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";

export function PurchaseReviewSheet({
  chatId,
  postId,
  sellerId,
  sellerNickname,
  productTitle,
  thumbnail,
  onClose,
  onSuccess,
}: {
  chatId: string;
  postId: string;
  sellerId: string;
  sellerNickname: string;
  productTitle: string;
  thumbnail: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
    >
      <div className="flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-white shadow-xl sm:max-h-[min(90vh,calc(100dvh-4rem-env(safe-area-inset-bottom,0px)))] sm:rounded-ui-rect">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-[16px] font-semibold text-gray-900">후기 보내기</h2>
          <button type="button" onClick={onClose} className="text-[14px] text-gray-500">
            닫기
          </button>
        </div>
        <div className="shrink-0 border-b border-gray-50 bg-gray-50/80 px-4 py-3">
          <p className="text-[12px] text-gray-500">이번 거래는 어땠나요?</p>
          <div className="mt-2 flex gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect bg-gray-200">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-[14px] font-medium text-gray-900">{productTitle}</p>
              <p className="mt-0.5 text-[12px] text-gray-600">{sellerNickname}</p>
            </div>
          </div>
        </div>
        <TradeReviewForm
          effectiveProductChatId={chatId}
          productId={postId}
          revieweeId={sellerId}
          revieweeLabel={sellerNickname}
          roleType="buyer_to_seller"
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
