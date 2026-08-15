"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** 장바구니 비우기 — 가운데 확인 [취소 | 비우기] */
export function StoreCartClearConfirmDialog({
  open,
  storeName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  storeName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const label = storeName.trim() || t("store_this_store");

  return (
    <DibayConfirmDialog
      open={open}
      title={t("store_cart_clear_title")}
      description={
        <>
          <strong>{label}</strong> {t("store_cart_clear_body")}
        </>
      }
      cancelLabel={t("common_cancel")}
      confirmLabel={busy ? t("store_cart_clearing") : t("store_cart_clear_confirm")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
