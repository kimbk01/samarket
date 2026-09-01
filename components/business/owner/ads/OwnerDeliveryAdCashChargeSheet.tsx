"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

/** Ads payment = AST-005 Business Cash. Routes Owner to the BC management page. */
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
  const href = sid
    ? `/stores/owner/business-cash?storeId=${encodeURIComponent(sid)}`
    : "/stores/owner/business-cash";

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Business Cash로 광고 결제",
        fallbackEn: "Ads paid with Business Cash",
      })}
      anchor="above-bottom-nav"
      ariaLabel={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Business Cash로 광고 결제",
        fallbackEn: "Ads paid with Business Cash",
      })}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className="text-[13px] text-sam-muted">
          {safeT("owner_ads_cash_charge_help", {
            fallbackKo:
              "광고비는 선택한 매장의 Business Cash에서 결제됩니다. 충전 또는 매장 포인트 전환 후 신청을 이어가세요.",
            fallbackEn:
              "Ad fees are paid from the selected store’s Business Cash. Top up or convert Store Points, then continue your application.",
          })}
        </p>
        <Link
          href={href}
          className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} flex w-full items-center justify-center`}
          data-owner-ads-cash-bc-link="1"
          onClick={onClose}
        >
          {safeT("owner_bc_go_finance", {
            fallbackKo: "Business Cash 관리",
            fallbackEn: "Manage Business Cash",
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
