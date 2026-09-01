"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

/** Ads payment uses canonical Cash and routes to Store Finance. */
export function OwnerDeliveryAdCashChargeSheet({
  open,
  onClose,
  storeId,
}: {
  open: boolean;
  onClose: () => void;
  storeId?: string | null;
  onSubmitted?: () => void;
}) {
  const { safeT } = useI18n();
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(open);
  const sid = String(storeId ?? "").trim();
  const href = `${OwnerRoutes.finance(sid)}#cash-manage`;

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Cash로 광고 결제",
        fallbackEn: "Ads paid with Cash",
      })}
      anchor="above-bottom-nav"
      ariaLabel={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Cash로 광고 결제",
        fallbackEn: "Ads paid with Cash",
      })}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className="text-[13px] text-sam-muted">
          {safeT("owner_ads_cash_charge_help", {
            fallbackKo: "광고비는 선택한 매장의 Cash에서 결제됩니다. 충전 또는 Coin 전환 후 신청을 이어가세요.",
            fallbackEn: "Ad fees are paid from the selected store’s Cash. Top up or convert Coin, then continue.",
          })}
        </p>
        <Link
          href={href}
          className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} flex w-full items-center justify-center`}
          data-owner-ads-cash-bc-link="1"
          onClick={onClose}
        >
          {safeT("owner_bc_go_finance", {
            fallbackKo: "Cash 관리",
            fallbackEn: "Manage Cash",
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
