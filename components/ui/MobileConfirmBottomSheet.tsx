"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

/** standard: dismissible | blocking: 버튼만으로 닫음 */
export type MobileSheetInteractionMode = "standard" | "blocking";

export type MobileConfirmBottomSheetProps = {
  open: boolean;
  onCancel: () => void;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmTone?: "danger" | "primary";
  onConfirm: () => void;
  zIndexClass?: string;
  ariaLabel?: string;
  interactionMode?: MobileSheetInteractionMode;
};

/**
 * Compatibility wrapper — authority is DibayConfirmDialog (horizontal [취소][확인]).
 */
export function MobileConfirmBottomSheet({
  open,
  onCancel,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "danger",
  onConfirm,
  zIndexClass,
  ariaLabel,
  interactionMode = "standard",
}: MobileConfirmBottomSheetProps) {
  return (
    <DibayConfirmDialog
      open={open}
      title={title}
      description={description}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone={confirmTone === "danger" ? "destructive" : "primary"}
      blocking={interactionMode === "blocking"}
      zIndexClass={zIndexClass}
      ariaLabel={ariaLabel}
    />
  );
}

export type MobileDualActionBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  primaryTone?: "primary" | "secondary";
  zIndexClass?: string;
  ariaLabel?: string;
  interactionMode?: MobileSheetInteractionMode;
};

/** Compatibility — dual choice maps to Confirm horizontal actions. */
export function MobileDualActionBottomSheet({
  open,
  onClose,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  primaryTone = "primary",
  zIndexClass,
  ariaLabel,
  interactionMode = "standard",
}: MobileDualActionBottomSheetProps) {
  const { t } = useI18n();
  return (
    <DibayConfirmDialog
      open={open}
      title={title}
      description={description}
      cancelLabel={secondaryLabel}
      confirmLabel={primaryLabel}
      onCancel={() => {
        onSecondary();
        if (interactionMode === "standard") onClose();
      }}
      onConfirm={() => {
        onPrimary();
      }}
      confirmTone={primaryTone === "primary" ? "primary" : "primary"}
      blocking={interactionMode === "blocking"}
      zIndexClass={zIndexClass}
      ariaLabel={ariaLabel ?? t("ui_sheet_choice_aria")}
    />
  );
}
