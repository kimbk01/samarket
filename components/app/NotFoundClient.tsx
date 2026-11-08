"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { tryDismissNativeSplash } from "@/lib/startup/startup-metrics";

export function NotFoundClient() {
  const { t } = useI18n();

  useEffect(() => {
    // 루트 not-found 는 (main) 셸 밖에서 그려진다 — 해제 주체가 없으면 OS 시작 화면에 갇힌다 (C2 · R1-e). 멱등.
    tryDismissNativeSplash("not_found");
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 text-center">
      <p className="sam-text-hero font-bold text-sam-meta">404</p>
      <p className="mt-2 sam-text-body-lg font-medium text-sam-fg">{t("ui_finish_not_found_title")}</p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("ui_finish_not_found_subtitle")}</p>
      <Link
        href="/philife"
        className="mt-8 rounded-ui-rect bg-signature px-6 py-2.5 sam-text-body font-medium text-white"
      >
        {t("app_error_go_home")}
      </Link>
    </div>
  );
}
