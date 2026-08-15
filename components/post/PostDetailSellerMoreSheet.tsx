"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

const rowClass =
  "flex w-full items-center gap-3 rounded-[length:var(--overlay-radius-md)] px-3 py-2.5 text-left text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-surface)] active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed disabled:opacity-45";

export function PostDetailSellerMoreSheet({
  open,
  onClose,
  onEdit,
  onDelete,
  onCancelSale,
  busy,
  editLocked,
  deleteLocked,
  editLockHint,
  deleteLockHint,
}: {
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelSale: () => void;
  busy?: boolean;
  editLocked?: boolean;
  deleteLocked?: boolean;
  editLockHint?: string;
  deleteLockHint?: string;
}) {
  const { t } = useI18n();

  const eLocked = !!editLocked;
  const dLocked = !!deleteLocked;
  const showLockBanner =
    (eLocked || dLocked) && ((editLockHint ?? "").trim() || (deleteLockHint ?? "").trim());

  const handleDelete = async () => {
    if (busy || dLocked) return;
    const ok = await dibayConfirm({
      title: t("ui_post_delete_confirm_feed"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    onDelete();
  };

  const handleCancelSale = async () => {
    if (busy) return;
    const ok = await dibayConfirm({
      title: t("mypage_comp_product_cancel_sale_confirm"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("mypage_comp_product_cancel_sale"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    onCancelSale();
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("ui_post_my_listing_title")}
      anchor="above-bottom-nav"
      ariaLabel={t("ui_sheet_close_aria")}
    >
      {busy ? (
        <p className={`mb-2 text-center ${OverlayUi.bodySecondary}`}>{t("community_meeting_join_processing")}</p>
      ) : null}
      <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2">
        {showLockBanner ? (
          <div className="space-y-1 px-3 py-2 text-[length:var(--overlay-caption-size)] leading-snug text-amber-800">
            {eLocked ? <p>{editLockHint}</p> : null}
            {dLocked ? <p>{deleteLockHint}</p> : null}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy || eLocked}
          title={eLocked ? editLockHint : undefined}
          onClick={() => {
            if (busy || eLocked) return;
            onClose();
            onEdit();
          }}
          className={rowClass}
        >
          <IconPencil className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
          {t("common_edit")}
        </button>
        <button
          type="button"
          disabled={busy || dLocked}
          title={dLocked ? deleteLockHint : undefined}
          onClick={() => void handleDelete()}
          className={`${rowClass} text-[color:var(--overlay-danger)] hover:bg-red-50`}
        >
          <IconTrash className="h-5 w-5 text-[color:var(--overlay-danger)]" />
          {t("common_delete")}
        </button>
        <div className="mt-2 space-y-2">
          <DibayOverlayButton
            roleTone="destructive"
            disabled={busy}
            onClick={() => void handleCancelSale()}
          >
            {t("mypage_comp_product_cancel_sale")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
            {t("common_close")}
          </DibayOverlayButton>
        </div>
      </div>
    </DibayBottomSheet>
  );
}
