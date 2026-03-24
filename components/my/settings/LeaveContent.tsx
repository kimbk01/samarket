"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 2단계 확인 UI.
 * 실제 즉시 삭제 대신 withdrawal_requested_at 요청형 구조로 설계.
 * auth.users 직접 삭제하지 않음.
 */
export function LeaveContent() {
  const [step, setStep] = useState<1 | 2>(1);

  const handleConfirm = () => {
    // TODO: Supabase에 withdrawal_requested_at 저장 또는 별도 탈퇴 요청 테이블에 insert.
    // 이후 관리자 승인 또는 이메일 확인 후 계정 비활성화.
    alert("탈퇴 요청이 접수되었습니다. 처리 후 안내드리겠습니다.");
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600">
        탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.
      </p>
      {step === 1 ? (
        <div className="flex gap-2">
          <Link
            href="/my/settings"
            className="rounded-lg border border-gray-300 px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            취소
          </Link>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="rounded-lg bg-red-500 px-4 py-2 text-[14px] font-medium text-white"
          >
            탈퇴하기
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-[14px] font-medium text-red-800">정말 탈퇴하시겠습니까?</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border border-gray-300 px-3 py-1.5 text-[14px] text-gray-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded bg-red-500 px-3 py-1.5 text-[14px] font-medium text-white"
            >
              탈퇴 요청
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
