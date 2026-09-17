"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/**
 * Address-change revalidation: destination not in store selected delivery LGUs.
 * Cart retained; order progression blocked. UX only — server remains fail-closed.
 */
export function StoreCartDeliveryUnavailableDialog({
  open,
  onDismiss,
  onChangeAddress,
}: {
  open: boolean;
  onDismiss: () => void;
  onChangeAddress: () => void;
}) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("store_cart_delivery_unavailable_title")}
      description={t("store_cart_delivery_unavailable_body")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("store_cart_out_of_range_change_address")}
      onCancel={onDismiss}
      onConfirm={onChangeAddress}
    />
  );
}
