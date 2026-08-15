"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";

export type PostListMenuAction =
  | "interest"
  | "not_interest"
  | "hide"
  | "exposure_criteria"
  | "report"
  | "edit_own"
  | "delete_own";

interface PostListMenuBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: PostListMenuAction) => void;
  /** 거래 글 본인일 때만 — 수정·삭제 블록 표시 */
  showOwnerTradeActions?: boolean;
  /** 예약중·거래완료 등 — 버튼 비활성 + 안내 (구호환: 둘 다 잠금) */
  ownerEditDeleteLocked?: boolean;
  ownerEditDeleteLockHint?: string;
  /** 분리 잠금 (거래 라이프사이클) */
  ownerEditLocked?: boolean;
  ownerDeleteLocked?: boolean;
  ownerEditLockHint?: string;
  ownerDeleteLockHint?: string;
}

function IconPlusCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconMinusCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function IconQuestionCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

const rowClass =
  "flex w-full items-center gap-3 rounded-[length:var(--overlay-radius-md)] px-3 py-2.5 text-left text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-secondary)] active:scale-[var(--overlay-press-scale)] disabled:cursor-not-allowed disabled:opacity-45";

export function PostListMenuBottomSheet({
  open,
  onClose,
  onAction,
  showOwnerTradeActions = false,
  ownerEditDeleteLocked = false,
  ownerEditDeleteLockHint = "예약·거래완료된 글은 수정·삭제할 수 없어요.",
  ownerEditLocked,
  ownerDeleteLocked,
  ownerEditLockHint = "",
  ownerDeleteLockHint = "",
}: PostListMenuBottomSheetProps) {
  const { t } = useI18n();

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
      title: t("ui_post_delete_confirm_feed"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    handle("delete_own");
  };

  return (
    <DibayBottomSheet open={open} onClose={onClose} anchor="above-bottom-nav" ariaLabel={t("ui_sheet_close_aria")}>
      <div className="mt-1 space-y-2 px-1 pb-2">
        {showOwnerTradeActions ? (
          <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2">
            {showLockBanner ? (
              <div className="space-y-1 px-3 py-2 text-[length:var(--overlay-caption-size)] leading-snug text-amber-800">
                {editLocked ? <p>{ownerEditLockHint || ownerEditDeleteLockHint}</p> : null}
                {deleteLocked ? <p>{ownerDeleteLockHint || ownerEditDeleteLockHint}</p> : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={editLocked}
              onClick={() => !editLocked && handle("edit_own")}
              className={rowClass}
            >
              <IconPencil className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
              수정
            </button>
            <button
              type="button"
              disabled={deleteLocked}
              onClick={() => void confirmDeleteOwn()}
              className={`${rowClass} text-[color:var(--overlay-danger)] hover:bg-red-50`}
            >
              <IconTrash className="h-5 w-5 text-[color:var(--overlay-danger)]" />
              삭제
            </button>
          </div>
        ) : null}

        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2">
          <button type="button" onClick={() => handle("interest")} className={rowClass}>
            <IconPlusCircle className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
            관심 있음
          </button>
          <button type="button" onClick={() => handle("not_interest")} className={rowClass}>
            <IconMinusCircle className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
            관심 없음
          </button>
        </div>

        <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2">
          <button type="button" onClick={() => handle("hide")} className={rowClass}>
            <IconEyeSlash className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
            이 글 숨기기
          </button>
          <button type="button" onClick={() => handle("exposure_criteria")} className={rowClass}>
            <IconQuestionCircle className="h-5 w-5 text-[color:var(--overlay-text-secondary)]" />
            게시글 노출 기준
          </button>
          <button
            type="button"
            onClick={() => handle("report")}
            className={`${rowClass} text-[color:var(--overlay-danger)] hover:bg-red-50`}
          >
            <IconReport className="h-5 w-5 text-[color:var(--overlay-danger)]" />
            신고하기
          </button>
        </div>

        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          닫기
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
