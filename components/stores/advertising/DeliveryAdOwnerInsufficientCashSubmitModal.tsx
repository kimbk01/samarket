"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

/**
 * Stage 1 hard block: insufficient Business Cash cannot submit.
 * No "submit anyway" path.
 */
export function DeliveryAdOwnerInsufficientCashSubmitModal({
  open,
  adAmountMinor,
  balanceMinor,
  busy,
  onCancel,
  onSubmitAnyway: _onSubmitAnyway,
}: {
  open: boolean;
  adAmountMinor: number;
  balanceMinor: number;
  busy?: boolean;
  onCancel: () => void;
  /** @deprecated Stage 1 — ignored; insufficient balance is hard-blocked. */
  onSubmitAnyway?: () => void;
}) {
  const { t, safeT } = useI18n();
  const shortage = Math.max(0, adAmountMinor - balanceMinor);
  const description = [
    `${t("owner_ads_confirm_ad_amount")}: ${formatDeliveryAdPhpMinor(adAmountMinor)}`,
    `${safeT("owner_bc_balance_label", {
      fallbackKo: "Business Cash 잔액",
      fallbackEn: "Business Cash balance",
    })}: ${formatDeliveryAdPhpMinor(balanceMinor)}`,
    `${safeT("owner_ads_cash_shortage_amount", {
      fallbackKo: "부족 금액",
      fallbackEn: "Shortfall",
    })}: ${formatDeliveryAdPhpMinor(shortage)}`,
    "",
    safeT("owner_bc_insufficient_hard_block", {
      fallbackKo:
        "Business Cash 잔액이 부족해 광고를 신청할 수 없습니다. 충전 또는 매장 포인트 전환 후 다시 시도해 주세요.",
      fallbackEn:
        "Insufficient Business Cash — you cannot submit this ad. Top up or convert Store Points, then try again.",
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
        confirmLabel={safeT("owner_bc_go_finance", {
          fallbackKo: "Business Cash 관리",
          fallbackEn: "Manage Business Cash",
        })}
        busy={busy}
        onCancel={onCancel}
        onConfirm={onCancel}
      />
    </div>
  );
}
