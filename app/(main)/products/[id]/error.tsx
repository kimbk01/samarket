"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-[15px] font-medium text-sam-fg">문제가 발생했어요</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 text-[14px] font-medium text-signature"
      >
        다시 시도
      </button>
    </div>
  );
}
