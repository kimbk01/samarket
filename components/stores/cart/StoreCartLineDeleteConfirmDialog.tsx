"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/**
 * UI-15 · S2-13 · S2-14 — 장바구니 줄 삭제 확인 (장바구니 페이지 🗑 · 미리보기 시트 −/삭제 공용).
 * 최소 수량에서 「−」가 🗑 로 바뀐 직후 연타로 바로 지워지지 않도록 항상 확인을 거친다.
 */
export function StoreCartLineDeleteConfirmDialog({
  open,
  lineTitle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  lineTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <DibayConfirmDialog
      open={open}
      title={t("store_cart_line_delete_confirm_title")}
      description={lineTitle.trim() || undefined}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("store_cart_line_delete_confirm_action")}
      confirmTone="destructive"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
