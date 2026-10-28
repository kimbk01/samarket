"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { tryDismissNativeSplash } from "@/lib/startup/startup-metrics";
import { isWebpackChunkLoadError, scheduleChunkReloadOnce } from "@/lib/next/import-with-chunk-retry";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[RootError]", error);
    // Error UI must not sit under cold-boot intro; dismiss once (idempotent).
    tryDismissNativeSplash("error_boundary");
    /**
     * 배포가 바뀌는 순간 예전 화면이 새 배포에 없는 코드 조각을 요청하면 ChunkLoadError —
     * 다시 그리기(reset)로는 같은 조각을 또 요청해 계속 실패한다. 최상위 오류 화면(global-error)처럼 한 번 새로 받는다
     * (2026-10-28 실기: Xiaomi 재시작 직후 「앱을 불러오는 중 문제가 발생했어요」 + 다시 시도 무한 실패).
     */
    if (isWebpackChunkLoadError(error)) scheduleChunkReloadOnce();
  }, [error]);

  const retry = () => {
    if (isWebpackChunkLoadError(error) && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 antialiased">
      <div className="flex flex-col items-center justify-center text-center">
        <p className="sam-text-body font-medium text-sam-fg">{t("app_error_root_title")}</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("app_error_subtitle")}</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
          >
            {t("common_retry")}
          </button>
          <Link href="/philife" className="sam-text-body font-medium text-signature">
            {t("app_error_go_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
