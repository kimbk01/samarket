"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

/** Informational sheet — ads use Store Cash; legacy Business Cash charge is disabled. */
export function OwnerDeliveryAdCashChargeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { safeT } = useI18n();
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(open);

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Store Cash로 광고 결제",
        fallbackEn: "Ads paid with Store Cash",
      })}
      anchor="above-bottom-nav"
      ariaLabel={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Store Cash로 광고 결제",
        fallbackEn: "Ads paid with Store Cash",
      })}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className="text-[13px] text-sam-muted">
          {safeT("owner_ads_cash_charge_help", {
            fallbackKo:
              "광고비는 매장 Store Cash 잔액에서 결제됩니다. 별도 Business Cash 충전은 없습니다. Store Cash는 상품권·정산에서 확인·전환하세요.",
            fallbackEn:
              "Ad fees are paid from your store Store Cash balance. There is no separate Business Cash top-up. Manage Store Cash in gift certificates / settlements.",
          })}
        </p>
        <Link
          href="/stores/owner/gift-certificates"
          className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} flex w-full items-center justify-center`}
          data-owner-ads-cash-store-cash-link="1"
          onClick={onClose}
        >
          {safeT("owner_ads_cash_charge_submit", {
            fallbackKo: "Store Cash 확인하기",
            fallbackEn: "Open Store Cash",
          })}
        </Link>
        <button
          type="button"
          className="w-full min-h-[44px] rounded-ui-rect border border-[#BDBDBD] text-[14px] font-semibold text-sam-fg"
          onClick={onClose}
        >
          {safeT("owner_ads_cash_charge_close", {
            fallbackKo: "닫기",
            fallbackEn: "Close",
          })}
        </button>
      </div>
    </DibayBottomSheet>
  );
}
