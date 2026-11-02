"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** 장바구니 비우기 — 가운데 확인 [취소 | 비우기] */
export function StoreCartClearConfirmDialog({
  open,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** 호출처 호환용 — 팝업 표준(설명 없음)으로 화면에는 쓰지 않는다 */
  storeName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("popup_q_clear_cart")}
      cancelLabel={t("common_cancel")}
      confirmLabel={busy ? t("store_cart_clearing") : t("popup_btn_clear")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
    />
  );
}
