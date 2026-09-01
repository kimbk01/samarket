"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

/**
 * Stage 1 hard block: insufficient Business Cash cannot submit.
 * Primary CTA → Business Cash page; secondary → convert section (#convert).
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

  const sid = String(storeId ?? "").trim();
  const ret = String(returnTo ?? "").trim();
  const qs = new URLSearchParams();
  if (sid) qs.set("storeId", sid);
  if (ret) qs.set("returnTo", ret);
  const base = `/stores/owner/business-cash${qs.toString() ? `?${qs.toString()}` : ""}`;
  const bcHref = base;
  const convertHref = `${base}#convert`;

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
        fallbackKo: "매장 포인트 전환",
        fallbackEn: "Convert Store Points",
      }),
      roleTone: "secondary",
      onClick: () => {
        onCancel();
        router.push(convertHref);
      },
      disabled,
    },
    {
      key: "confirm",
      label: busy
        ? t("common_processing")
        : safeT("owner_bc_go_finance", {
            fallbackKo: "Business Cash 관리",
            fallbackEn: "Manage Business Cash",
          }),
      roleTone: "primary",
      onClick: () => {
        onCancel();
        router.push(bcHref);
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
          fallbackKo: "Business Cash 잔액이 부족합니다",
          fallbackEn: "Insufficient Business Cash",
        })}
        description={description}
        actions={actions}
        actionsLayout="stack"
      />
    </div>
  );
}
