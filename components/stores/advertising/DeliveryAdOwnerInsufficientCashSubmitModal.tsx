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
    "",
    safeT("owner_bc_insufficient_hard_block", {
      fallbackKo:
        "Cash 잔액이 부족해 광고를 신청할 수 없습니다. 충전 또는 Coin 전환 후 다시 시도해 주세요.",
      fallbackEn:
        "Insufficient Cash — you cannot submit this ad. Top up or convert Coin, then try again.",
    }),
  ].join("\n");

  const sid = String(storeId ?? "").trim();
  const ret = String(returnTo ?? "").trim();
  const base = OwnerRoutes.finance(sid);
  const financeHref = ret
    ? `${base}${base.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(ret)}`
    : base;
  const cashHref = `${financeHref}#cash-manage`;

  const disabled = Boolean(busy);
  const actions: DibayOverlayAction[] = [
    {
      key: "cancel",
      label: t("owner_ads_cancel"),
      roleTone: "secondary",
      onClick: onCancel,
      disabled,
    },
    {
      key: "convert",
      label: safeT("owner_bc_convert_cta", {
        fallbackKo: "Coin 전환",
        fallbackEn: "Convert Coin",
      }),
      roleTone: "secondary",
      onClick: () => {
        onCancel();
        router.push(cashHref);
      },
      disabled,
    },
    {
      key: "confirm",
      label: busy
        ? t("common_processing")
        : safeT("owner_bc_go_finance", {
            fallbackKo: "Cash 관리",
            fallbackEn: "Manage Cash",
          }),
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
        title={safeT("owner_ads_cash_shortage_modal_title", {
          fallbackKo: "Cash 잔액이 부족합니다",
          fallbackEn: "Insufficient Cash",
        })}
        description={description}
        actions={actions}
        actionsLayout="stack"
      />
    </div>
  );
}
