"use client";

import { useEffect } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function PostDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[post/[id]]", error);
  }, [error]);

  const isTimeout = error.message.includes("trade_detail_load_timeout");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="sam-text-body-lg font-semibold text-sam-fg">
        {isTimeout ? "불러오는 데 시간이 너무 오래 걸렸습니다." : "글을 불러오지 못했습니다."}
      </p>
      <p className="max-w-sm sam-text-body-secondary text-sam-muted">
        {isTimeout
          ? "네트워크 상태를 확인한 뒤 다시 시도해 주세요."
          : error.message?.trim() || "잠시 후 다시 시도해 주세요."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          다시 시도
        </button>
        <AppBackButton className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body text-sam-fg" />
      </div>
    </div>
  );
}
