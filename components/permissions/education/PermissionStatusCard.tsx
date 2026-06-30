"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { buildPermissionCapabilitySummary } from "@/lib/permissions/education/permission-capability-summary";
import { openPermissionDiagnosticSheet } from "@/lib/permissions/education/permission-education-bridge";
import { isMobileNativePlatform } from "@/lib/permissions/education/permission-education-platform";

export function PermissionStatusCard() {
  const { safeT } = useI18n();
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = isMobileNativePlatform();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await buildPermissionCapabilitySummary();
      setReady(summary.overallReady);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <button
      type="button"
      className="mb-4 w-full rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-left"
      onClick={() => openPermissionDiagnosticSheet()}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`${Sam.text.cardTitle} text-sam-fg`}>
            {safeT(isMobile ? "perm_edu_status_card_title" : "perm_edu_web_status_card_title", {
              fallbackKo: isMobile ? "통화·알림 준비 상태" : "브라우저 통화 권한",
              fallbackEn: isMobile ? "Call & notification readiness" : "Browser call permissions",
            })}
          </p>
          <p className={`mt-1 ${Sam.text.helper} text-sam-muted`}>
            {loading
              ? safeT("settings_loading_settings", {
                  fallbackKo: "설정을 불러오는 중…",
                  fallbackEn: "Loading settings…",
                })
              : ready
                ? safeT(isMobile ? "perm_edu_status_card_ready" : "perm_edu_web_status_card_ready", {
                    fallbackKo: isMobile ? "모든 항목이 준비되었습니다" : "브라우저 권한이 준비되었습니다",
                    fallbackEn: isMobile ? "Everything looks ready" : "Browser permissions look ready",
                  })
                : safeT(isMobile ? "perm_edu_status_card_issues" : "perm_edu_web_status_card_issues", {
                    fallbackKo: isMobile
                      ? "확인이 필요한 항목이 있습니다"
                      : "브라우저에서 확인할 권한이 있습니다",
                    fallbackEn: isMobile
                      ? "Some items need attention"
                      : "Some browser permissions need attention",
                  })}
          </p>
        </div>
        <span className={`${Sam.text.helper} text-sam-muted`}>
          {safeT("perm_edu_status_card_action", {
            fallbackKo: "상세 진단 보기",
            fallbackEn: "Open detailed check",
          })}
        </span>
      </div>
    </button>
  );
}
