"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

/**
 * MODEL B: insufficient Cash may still submit after explicit confirmation.
 * Never silent; never fake top-up.
 */
export function DeliveryAdOwnerInsufficientCashSubmitModal({
  open,
  adAmountMinor,
  balanceMinor,
  busy,
  onCancel,
  onSubmitAnyway,
}: {
  open: boolean;
  adAmountMinor: number;
  balanceMinor: number;
  busy?: boolean;
  onCancel: () => void;
  onSubmitAnyway: () => void;
}) {
  const { t, safeT } = useI18n();
  const shortage = Math.max(0, adAmountMinor - balanceMinor);
  const description = [
    `${t("owner_ads_confirm_ad_amount")}: ${formatDeliveryAdPhpMinor(adAmountMinor)}`,
    `${t("owner_ads_confirm_cash_balance")}: ${formatDeliveryAdPhpMinor(balanceMinor)}`,
    `${safeT("owner_ads_cash_shortage_amount", {
      fallbackKo: "부족 금액",
      fallbackEn: "Shortfall",
    })}: ${formatDeliveryAdPhpMinor(shortage)}`,
    "",
    safeT("owner_ads_cash_shortage_modal_body", {
      fallbackKo:
        "광고 신청은 접수할 수 있지만, 관리자 승인 후 광고를 시작하려면 Business Cash 결제가 필요합니다.",
      fallbackEn:
        "You can submit for review, but you will need Business Cash after approval before the ad can go live.",
    }),
    "",
    safeT("owner_ads_cash_grant_ask_admin", {
      fallbackKo: "Business Cash 지급이 필요한 경우 관리자에게 문의해 주세요. (외부 충전 없음)",
      fallbackEn: "Ask admin for a Business Cash grant if needed. (No external top-up.)",
    }),
  ].join("\n");

  return (
    <div data-owner-ads-cash-shortage-modal={open ? "1" : "0"}>
      <OwnerStoreAdminConfirmModal
        open={open}
        titleId="owner-ads-insufficient-cash-submit"
        title={safeT("owner_ads_cash_shortage_modal_title", {
          fallbackKo: "Business Cash 잔액이 부족합니다",
          fallbackEn: "Insufficient Business Cash",
        })}
        description={description}
        cancelLabel={t("owner_ads_cancel")}
        confirmLabel={safeT("owner_ads_cash_shortage_submit_anyway", {
          fallbackKo: "그래도 광고 신청",
          fallbackEn: "Submit anyway",
        })}
        busy={busy}
        onCancel={onCancel}
        onConfirm={onSubmitAnyway}
      />
    </div>
  );
}
