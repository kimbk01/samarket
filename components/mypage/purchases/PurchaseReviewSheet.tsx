"use client";

import { TradeReviewForm } from "@/components/trade/TradeReviewForm";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const { t } = useI18n();
  return (
    <DibayBottomSheet
      open
      onClose={onClose}
      title={t("mypage_comp_purchase_review_sheet_title")}
      anchor="above-bottom-nav"
      panelClassName="!max-h-[min(90dvh,640px)]"
    >
      <div className="mb-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-3">
        <p className={OverlayUi.caption}>{t("mypage_comp_purchase_review_sheet_subtitle")}</p>
        <div className="mt-2 flex gap-3">
          <SamarketThumbnail
            src={thumbnail}
            size={56}
            roundedClassName="rounded-[length:var(--overlay-radius-md)]"
            className="bg-[color:var(--overlay-border)]"
          />
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium text-[color:var(--overlay-text-primary)]">{productTitle}</p>
            <p className={`mt-0.5 ${OverlayUi.caption}`}>{sellerNickname}</p>
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
    </DibayBottomSheet>
  );
}
