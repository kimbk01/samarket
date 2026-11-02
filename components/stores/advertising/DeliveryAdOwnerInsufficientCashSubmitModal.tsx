"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { OwnerRoutes } from "@/lib/business/owner-routes";

/**
 * hard block: insufficient canonical Cash cannot submit.
 * Actions route to canonical Store Finance Cash management.
 */
export function DeliveryAdOwnerInsufficientCashSubmitModal({
  open,
  adAmountMinor,
  balanceMinor,
  busy,
  storeId,
  returnTo,
  onCancel,
  onSubmitAnyway: _onSubmitAnyway,
}: {
  open: boolean;
  adAmountMinor: number;
  balanceMinor: number;
  busy?: boolean;
  storeId?: string | null;
  /** Absolute or app path to resume draft after funding. */
  returnTo?: string | null;
  onCancel: () => void;
  /** @deprecated Stage 1 — ignored; insufficient balance is hard-blocked. */
  onSubmitAnyway?: () => void;
}) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const shortage = Math.max(0, adAmountMinor - balanceMinor);
  const description = [
    `${t("owner_ads_confirm_ad_amount")}: ${formatDeliveryAdPhpMinor(adAmountMinor)}`,
    `${safeT("owner_bc_balance_label", {
      fallbackKo: "Cash 잔액",
      fallbackEn: "Cash balance",
    })}: ${formatDeliveryAdPhpMinor(balanceMinor)}`,
    `${safeT("owner_ads_cash_shortage_amount", {
      fallbackKo: "부족 금액",
      fallbackEn: "Shortfall",
    })}: ${formatDeliveryAdPhpMinor(shortage)}`,
  ].join("\n");

  const sid = String(storeId ?? "").trim();
  const ret = String(returnTo ?? "").trim();
  const base = OwnerRoutes.finance(sid);
  const financeHref = ret
    ? `${base}${base.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(ret)}`
    : base;
  const cashHref = `${financeHref}#cash-manage`;

  const disabled = Boolean(busy);
  /**
   * 버튼 2개 = 가로 · 취소 왼쪽 · 「Cash 관리」 오른쪽 (팝업 SSOT §3-4).
   * 예전 「Coin 전환」 버튼은 「Cash 관리」와 같은 정산 구역(#cash-manage)으로 가서 1개로 합침
   * (그 구역에서 충전·Coin 전환을 모두 함 · Owner 「1개로 합치기」 2026-11-02).
   */
  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: t("common_cancel"),
      roleTone: "secondary",
      onClick: onCancel,
      disabled,
    },
    {
      key: "confirm",
      label: busy
        ? t("common_processing")
        : t("popup_btn_cash_manage"),
      roleTone: "primary",
      onClick: () => {
        onCancel();
        router.push(cashHref);
      },
      disabled,
    },
  ];

  return (
    <div data-owner-ads-cash-shortage-modal={open ? "1" : "0"}>
      <DibayDialog
        open={open}
        onClose={disabled ? undefined : onCancel}
        dismissible={!disabled}
        title={t("popup_q_charge_cash")}
        description={description}
        actions={actions}
        actionsLayout="row"
      />
    </div>
  );
}
