"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { prefetchTradeBoostState, withTradeBoostListingNote } from "@/lib/promotion/trade-boost-listing-notice";
import { useEffect } from "react";

/**
 * v5 (Owner 2026-11-03): 「관심 있음」(저장 없음·카드 「관심 N」과 뜻 겹침)·「게시글 노출 기준」(처리 없음) 삭제,
 * 「관심 없음」은 「이 글 숨기기」와 같은 동작이라 하나로.
 */
export type PostListMenuAction =
  | "hide"
  | "report"
  | "edit_own"
  | "delete_own"
  /** 시안 v3: 내 판매중 거래 글 → 광고하기 창 */
  | "promote_own";

interface PostListMenuBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: PostListMenuAction) => void;
  /** 거래 글 id — 광고 중이면 삭제 확인창에 「광고가 끝나요」 한 줄 (trade-boost-listing-notice) */
  tradeBoostPostId?: string;
  /** 거래 글 본인일 때만 — 수정·삭제 블록 표시 */
  showOwnerTradeActions?: boolean;
  /** 내 판매중 거래 글(노출 가능)일 때만 — 맨 위 「광고하기」 */
  showOwnerAdAction?: boolean;
  /** 예약중·거래완료 등 — 버튼 비활성 + 안내 (구호환: 둘 다 잠금) */
  ownerEditDeleteLocked?: boolean;
  ownerEditDeleteLockHint?: string;
  /** 분리 잠금 (거래 라이프사이클) */
  ownerEditLocked?: boolean;
  ownerDeleteLocked?: boolean;
  ownerEditLockHint?: string;
  ownerDeleteLockHint?: string;
}

function IconMegaphone({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zm12-3a5 5 0 010 8m3-11a9 9 0 010 14" />
    </svg>
  );
}

function IconEyeSlash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function IconReport({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

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

export function PostListMenuBottomSheet({
  open,
  tradeBoostPostId,
  onClose,
  onAction,
  showOwnerTradeActions = false,
  showOwnerAdAction = false,
  ownerEditDeleteLocked = false,
  ownerEditDeleteLockHint: ownerEditDeleteLockHintProp,
  ownerEditLocked,
  ownerDeleteLocked,
  ownerEditLockHint = "",
  ownerDeleteLockHint = "",
}: PostListMenuBottomSheetProps) {
  const { t } = useI18n();
  /** 재감사 B-6: 시트가 열릴 때 광고 상태를 미리 받아 삭제 확인창이 기다리지 않게 */
  useEffect(() => {
    if (open && tradeBoostPostId) prefetchTradeBoostState(tradeBoostPostId);
  }, [open, tradeBoostPostId]);
  const ownerEditDeleteLockHint = ownerEditDeleteLockHintProp ?? t("popup_trade_edit_delete_locked_hint");

  const editLocked = ownerEditLocked ?? ownerEditDeleteLocked;
  const deleteLocked = ownerDeleteLocked ?? ownerEditDeleteLocked;
  const showLockBanner =
    (editLocked || deleteLocked) &&
    (ownerEditLockHint || ownerDeleteLockHint || ownerEditDeleteLockHint);

  const handle = (action: PostListMenuAction) => {
    onAction?.(action);
    onClose();
  };

  const confirmDeleteOwn = async () => {
    if (deleteLocked) return;
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
    handle("delete_own");
  };

  return (
    <DibayBottomSheet open={open} onClose={onClose} ariaLabel={t("popup_sheet_more_options_aria")}>
      <div className="mt-1 space-y-2 px-1 pb-2">
        {showOwnerTradeActions ? (
          <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
            {showLockBanner ? (
              <div className={`space-y-1 px-3 py-2 ${OverlayUi.captionWarning}`}>
                {editLocked ? <p>{ownerEditLockHint || ownerEditDeleteLockHint}</p> : null}
                {deleteLocked ? <p>{ownerDeleteLockHint || ownerEditDeleteLockHint}</p> : null}
              </div>
            ) : null}
            {showOwnerAdAction ? (
              <button type="button" onClick={() => handle("promote_own")} className={rowClass} data-post-menu-action="promote_own">
                <IconMegaphone className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
                {t("trade_ad_cta")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={editLocked}
              onClick={() => !editLocked && handle("edit_own")}
              className={rowClass}
            >
              <IconPencil className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
              {t("common_edit")}
            </button>
            <button
              type="button"
              disabled={deleteLocked}
              onClick={() => void confirmDeleteOwn()}
              className={rowDangerClass}
            >
              <IconTrash className="h-5 w-5 text-current" />
              {t("common_delete")}
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
          <button type="button" onClick={() => handle("hide")} className={rowClass}>
            <IconEyeSlash className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
            {t("popup_menu_hide_post")}
          </button>
          <button
            type="button"
            onClick={() => handle("report")}
            className={rowDangerClass}
          >
            <IconReport className="h-5 w-5 text-current" />
            {t("popup_menu_report")}
          </button>
        </div>

        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {t("common_close")}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
