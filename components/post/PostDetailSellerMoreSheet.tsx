"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { withTradeBoostListingNote } from "@/lib/promotion/trade-boost-listing-notice";

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

const rowClass = `${OverlayUi.popoverItem} gap-3`;
const rowDangerClass = `${OverlayUi.popoverItemDanger} gap-3`;

export function PostDetailSellerMoreSheet({
  open,
  tradeBoostPostId,
  onClose,
  onEdit,
  onDelete,
  onSelectSupport,
  busy,
  editLocked,
  deleteLocked,
  editLockHint,
  deleteLockHint,
  onMarkSold,
}: {
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 거래 글 id — 광고 중이면 삭제 확인창에 「광고가 끝나요」 한 줄 (trade-boost-listing-notice) */
  tradeBoostPostId?: string;
  /** 내 거래글 「문의하기」 (숨김·삭제 이의 등 — 거래 문의 + 이 글 참조) — 없으면 숨김 */
  onSelectSupport?: () => void;
  busy?: boolean;
  editLocked?: boolean;
  deleteLocked?: boolean;
  editLockHint?: string;
  deleteLockHint?: string;
  /** 거래 B (Owner 2026-10-28): 판매중 → 판매완료 한 방향만 (되돌리기·구매자 지정 없음) — 판매완료·숨김이면 넘기지 않아 숨김 */
  onMarkSold?: () => void;
}) {
  const { t } = useI18n();

  const eLocked = !!editLocked;
  const dLocked = !!deleteLocked;
  const showLockBanner =
    (eLocked || dLocked) && ((editLockHint ?? "").trim() || (deleteLockHint ?? "").trim());

  const handleDelete = async () => {
    if (busy || dLocked) return;
    const ok = await dibayConfirm({
      title: t("popup_post_delete_title"),
      description: tradeBoostPostId
        ? await withTradeBoostListingNote(t, tradeBoostPostId, "delete", t("popup_note_cannot_restore"))
        : t("popup_note_cannot_restore"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    onDelete();
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("ui_post_my_listing_title")}
      ariaLabel={t("ui_sheet_close_aria")}
    >
      {busy ? (
        <p className={`mb-2 text-center ${OverlayUi.bodySecondary}`}>{t("community_meeting_join_processing")}</p>
      ) : null}
      <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
        {showLockBanner ? (
          <div className={`space-y-1 px-3 py-2 ${OverlayUi.captionWarning}`}>
            {eLocked ? <p>{editLockHint}</p> : null}
            {dLocked ? <p>{deleteLockHint}</p> : null}
          </div>
        ) : null}
        {onMarkSold ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (busy) return;
              onClose();
              onMarkSold();
            }}
            className={`${rowClass} !font-semibold`}
          >
            {t("trade_listing_mark_sold")}
          </button>
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
          className={rowDangerClass}
        >
          <IconTrash className="h-5 w-5 text-current" />
          {t("common_delete")}
        </button>
        {onSelectSupport ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectSupport();
            }}
            className={rowClass}
          >
            {t("support_enter_cta")}
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
          {t("common_close")}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
