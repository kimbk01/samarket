"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CommunityMessengerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[community-messenger]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <p className="text-base font-medium text-sam-text-primary">메신저를 불러오지 못했습니다.</p>
      <p className="max-w-sm text-sm text-sam-text-secondary">
        네트워크 상태를 확인한 뒤 다시 시도해 주세요. 문제가 계속되면 잠시 후 접속해 주세요.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="rounded-ui-rect bg-sam-primary px-4 py-2 text-sm font-medium text-sam-text-on-primary"
          onClick={() => reset()}
        >
          다시 시도
        </button>
        <Link
          href="/home"
          className="rounded-ui-rect border border-sam-border-default px-4 py-2 text-sm text-sam-text-primary"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
