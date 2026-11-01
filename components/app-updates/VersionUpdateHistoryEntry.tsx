"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAppReleaseHistory } from "@/components/app-updates/use-app-release-history";
import { APP_RELEASE_HISTORY_HREF } from "@/lib/app-releases/app-release-paths";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 버전 정보 화면 아래 (앱 업데이트 v2) — 「업데이트 내역 ›」 줄(새 버전이면 「새 버전」 표시).
 * iOS 는 Android 처럼 업데이트 버튼 1개: 새 버전이면 App Store 열기, 최신이면 비활성 「최신 버전」.
 * Android 의 버튼은 기존 Play 버튼 하나만 쓴다(중복 버튼 없음).
 */
export function VersionUpdateHistoryEntry() {
  const { t } = useI18n();
  const h = useAppReleaseHistory();
  if (h.status === "web") return null;
  return (
    <div className="w-full max-w-sm px-5 pb-8" data-testid="version-update-history-entry">
      {h.platform === "ios" && h.status === "ready" ? (
        <button
          type="button"
          disabled={!h.hasUpdate || !h.latestStoreUrl}
          onClick={() => {
            if (h.latestStoreUrl) window.open(h.latestStoreUrl, "_system");
          }}
          className={`${Sam.btn.primaryCombo} ${Sam.focusRing} mb-4 flex min-h-12 w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60`}
          data-testid="version-ios-update-cta"
        >
          {h.hasUpdate && h.latestStoreUrl ? t("app_updates_update_now") : t("app_updates_latest")}
        </button>
      ) : null}
      <Link
        href={APP_RELEASE_HISTORY_HREF}
        className="flex min-h-12 w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[15px] text-sam-fg active:bg-sam-pressed-surface"
        data-testid="version-update-history-link"
      >
        <span>{t("app_updates_title")}</span>
        <span className="flex items-center gap-1.5">
          {h.hasUpdate ? (
            <span className="rounded-ui-rect bg-sam-primary px-1.5 text-[11px] font-bold leading-[18px] text-sam-on-primary">
              {t("app_updates_new")}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-sam-meta" strokeWidth={2} aria-hidden />
        </span>
      </Link>
    </div>
  );
}
