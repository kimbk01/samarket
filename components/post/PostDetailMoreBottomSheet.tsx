"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { blockUser } from "@/lib/reports/user-blocks-client";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { dibayAlert, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";

function IconEyeSlash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

function IconReportAlert({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function IconShare({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

const rowClass =
  "flex w-full items-center gap-3 rounded-[length:var(--overlay-radius-md)] px-3 py-3 text-left text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-surface)] active:scale-[var(--overlay-press-scale)]";

export function PostDetailMoreBottomSheet({
  open,
  onClose,
  onSelectReport,
  onSelectShare,
  authorUserId,
  authorNickname,
  reportEnabled = true,
}: {
  open: boolean;
  onClose: () => void;
  /** 신고 사유 입력 단계로 */
  onSelectReport: () => void;
  onSelectShare: () => void;
  authorUserId: string;
  authorNickname?: string | null;
  /** false면 시트에서 「신고하기」만 숨김 (더보기 메뉴는 계속 사용) */
  reportEnabled?: boolean;
}) {
  const { t, safeT } = useI18n();
  const requireAction = useRequireAuthAction();

  const handleHideAuthor = () => {
    const u = getCurrentUser();
    if (!u?.id) {
      void requireAction("community_bookmark", handleHideAuthor);
      return;
    }
    void blockUser(u.id, authorUserId, authorNickname ?? undefined).then(async () => {
      onClose();
      await dibayAlert({ title: t("ui_post_user_hidden_alert") });
    });
  };

  const handleReport = () => {
    const u = getCurrentUser();
    if (!u?.id) {
      void requireAction("trade_report", handleReport);
      return;
    }
    onClose();
    onSelectReport();
  };

  const handleShare = () => {
    onClose();
    onSelectShare();
  };

  return (
    <DibayBottomSheet open={open} onClose={onClose} anchor="above-bottom-nav" ariaLabel={t("ui_sheet_close_aria")}>
      <div className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2">
        <button type="button" onClick={handleShare} className={rowClass}>
          <IconShare className="h-5 w-5 shrink-0 text-[color:var(--overlay-text-secondary)]" />
          {safeT("trade_detail_share", { fallbackKo: "공유하기", fallbackEn: "Share" })}
        </button>
        <button type="button" onClick={handleHideAuthor} className={rowClass}>
          <IconEyeSlash className="h-5 w-5 shrink-0 text-[color:var(--overlay-text-secondary)]" />
          이 사용자의 글 보지 않기
        </button>
        {reportEnabled ? (
          <button
            type="button"
            onClick={handleReport}
            className={`${rowClass} font-medium text-[color:var(--overlay-danger)] hover:bg-red-50`}
          >
            <IconReportAlert className="h-5 w-5 shrink-0 text-[color:var(--overlay-danger)]" />
            신고하기
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          닫기
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
