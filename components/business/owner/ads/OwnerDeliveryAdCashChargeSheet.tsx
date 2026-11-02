"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
      ariaLabel={safeT("owner_ads_cash_charge_title", {
        fallbackKo: "Cash로 광고 결제",
        fallbackEn: "Ads paid with Cash",
      })}
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className={OverlayUi.bodySecondary}>
          {safeT("owner_ads_cash_charge_help", {
            fallbackKo: "광고비는 선택한 매장의 Cash에서 결제됩니다. 충전 또는 Coin 전환 후 신청을 이어가세요.",
            fallbackEn: "Ad fees are paid from the selected store’s Cash. Top up or convert Coin, then continue.",
          })}
        </p>
        <Link
          href={href}
          className={OverlayUi.btn.primary}
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
          className={`${OverlayUi.btn.secondary} w-full`}
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
