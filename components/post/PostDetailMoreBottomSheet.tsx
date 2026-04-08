"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { blockUser } from "@/lib/reports/mock-blocked-users";

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

const LOGIN_REDIRECT = "/mypage/account";

export function PostDetailMoreBottomSheet({
  open,
  onClose,
  onSelectReport,
  authorUserId,
  authorNickname,
  reportEnabled = true,
}: {
  open: boolean;
  onClose: () => void;
  /** 신고 사유 입력 단계로 */
  onSelectReport: () => void;
  authorUserId: string;
  authorNickname?: string | null;
  /** false면 시트에서 「신고하기」만 숨김 (더보기 메뉴는 계속 사용) */
  reportEnabled?: boolean;
}) {
  const router = useRouter();
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setSlideIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleHideAuthor = () => {
    const u = getCurrentUser();
    if (!u?.id) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    blockUser(u.id, authorUserId, authorNickname ?? undefined);
    onClose();
    window.alert("이 사용자의 글을 숨겼습니다.");
  };

  const handleReport = () => {
    const u = getCurrentUser();
    if (!u?.id) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    onClose();
    onSelectReport();
  };

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="닫기"
      />
      <div
        className={`relative w-full max-w-lg rounded-t-2xl bg-white px-4 pb-8 pt-2 shadow-xl transition-transform duration-300 ease-out ${
          slideIn ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden />

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
          <button
            type="button"
            onClick={handleHideAuthor}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] text-gray-900 hover:bg-white"
          >
            <IconEyeSlash className="h-5 w-5 shrink-0 text-gray-500" />
            이 사용자의 글 보지 않기
          </button>
          {reportEnabled ? (
            <button
              type="button"
              onClick={handleReport}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] font-medium text-red-600 hover:bg-red-50"
            >
              <IconReportAlert className="h-5 w-5 shrink-0 text-red-500" />
              신고하기
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-gray-100 py-3.5 text-[15px] font-medium text-gray-800 hover:bg-gray-200"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
