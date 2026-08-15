"use client";

import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 모바일·태블릿: + 탭 후 네이티브 앨범/카메라로 가기 전 단계.
 * OS 사진 선택 UI는 브라우저가 띄우므로 커스터마이즈 불가 — 그 전에 우리 시트로 취소(X·배경) 가능하게 함.
 */
export function ChatMobileAttachSheet({
  open,
  onClose,
  instagram,
  disabled,
  onPickCamera,
  onPickGallery,
}: {
  open: boolean;
  onClose: () => void;
  instagram: boolean;
  disabled: boolean;
  onPickCamera: () => void;
  onPickGallery: () => void;
}) {
  const { t } = useI18n();

  const rowClass = `flex w-full shrink-0 items-center gap-3 rounded-[length:var(--overlay-radius-md)] px-4 py-3.5 text-left text-[length:var(--overlay-body-1-size)] font-medium transition active:scale-[var(--overlay-press-scale)] disabled:opacity-45 ${
    instagram
      ? "text-[color:var(--overlay-text-primary)] hover:bg-black/[0.04] active:bg-black/[0.06]"
      : "text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-secondary)] active:bg-[color:var(--overlay-secondary)]"
  }`;

  const runThenPick = (pick: () => void) => {
    onClose();
    window.setTimeout(() => pick(), 0);
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("chats_attach_sheet_title")}
      anchor="above-bottom-nav"
      showHandle
      ariaLabel={t("chats_attach_sheet_title")}
    >
      <nav className="flex flex-col px-1 pb-2 pt-1" aria-label={t("chats_attach_methods_aria")}>
        <button
          type="button"
          className={rowClass}
          disabled={disabled}
          onClick={() => runThenPick(onPickCamera)}
        >
          <CameraGlyph className="h-6 w-6 shrink-0 opacity-85" />
          {t("common_take_photo")}
        </button>
        <button
          type="button"
          className={rowClass}
          disabled={disabled}
          onClick={() => runThenPick(onPickGallery)}
        >
          <GalleryGlyph className="h-6 w-6 shrink-0 opacity-85" />
          {t("common_choose_from_album")}
        </button>
        <div className="mt-2">
          <button
            type="button"
            className={OverlayUi.btn.secondary}
            disabled={disabled}
            onClick={onClose}
          >
            {t("common_close")}
          </button>
        </div>
      </nav>
    </DibayBottomSheet>
  );
}

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GalleryGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
