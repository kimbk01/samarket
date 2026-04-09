"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[15px] font-medium text-gray-900">
        관리자 페이지에서 오류가 발생했어요
      </p>
      <p className="mt-2 text-[13px] text-gray-500">
        잠시 후 다시 시도하거나 관리자 메인으로 이동해 주세요.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          다시 시도
        </button>
        <Link href="/admin" className="text-[14px] font-medium text-signature">
          관리자 홈으로
        </Link>
      </div>
    </div>
  );
}
