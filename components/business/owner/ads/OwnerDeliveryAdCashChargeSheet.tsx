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
      title={safeT("owner_ads_cash_charge_title")}
      ariaLabel={safeT("owner_ads_cash_charge_title")}
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <div className="mt-3 space-y-4" data-owner-ads-cash-charge="sheet">
        <p className={OverlayUi.bodySecondary}>
          {safeT("owner_ads_cash_charge_help")}
        </p>
        <Link
          href={href}
          className={OverlayUi.btn.primary}
          data-owner-ads-cash-bc-link="1"
          onClick={onClose}
        >
          {safeT("owner_bc_go_finance")}
        </Link>
        <button
          type="button"
          className={`${OverlayUi.btn.secondary} w-full`}
          onClick={onClose}
        >
          {safeT("owner_ads_cash_charge_close")}
        </button>
      </div>
    </DibayBottomSheet>
  );
}
