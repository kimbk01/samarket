"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 antialiased">
      <div className="flex flex-col items-center justify-center text-center">
        <p className="sam-text-body font-medium text-sam-fg">
          일시적인 오류가 발생했어요
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
          >
            다시 시도
          </button>
          <Link
            href="/home"
            className="sam-text-body font-medium text-signature"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
