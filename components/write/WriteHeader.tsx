"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";

interface WriteHeaderProps {
  /** 카테고리 표시 이름 */
  categoryName: string;
  /** 확인 후 이동할 경로 (미주입 시 history.back) */
  backHref?: string;
  /** 우측 액션 (예: 등록 버튼) — 당근형: 우측 등록 */
  rightAction?: React.ReactNode;
}

/**
 * 당근형: 좌측 뒤로가기(클릭 시 confirm), 우측 등록. 홈 버튼 없음.
 */
export function WriteHeader({
  categoryName,
  backHref,
  rightAction,
}: WriteHeaderProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleBack = () => {
    setConfirmOpen(true);
  };

  const handleConfirmLeave = () => {
    setConfirmOpen(false);
    if (backHref != null) {
      router.push(backHref);
    } else {
      window.history.back();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <AppBackButton onBack={handleBack} />
        <h1 className="text-[16px] font-semibold text-gray-900">
          {categoryName} · 글쓰기
        </h1>
        <span className="w-10">{rightAction ?? null}</span>
      </header>
      {confirmOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <p className="text-[15px] text-gray-800">
              글쓰기를 취소할까요? 입력한 내용이 저장되지 않습니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-[14px] font-medium text-gray-700"
              >
                계속 쓰기
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="flex-1 rounded-lg bg-gray-900 py-2.5 text-[14px] font-medium text-white"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
