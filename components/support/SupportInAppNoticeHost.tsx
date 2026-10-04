"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import {
  dismissSupportInAppNotice,
  getSupportInAppNotice,
  subscribeSupportInAppNotice,
  type SupportInAppNoticeType,
} from "@/lib/support/support-in-app-notice";
import { Sam } from "@/lib/ui/sam-component-classes";

/** Same lifetime as the messenger banner so the two never feel different. */
const SUPPORT_IN_APP_NOTICE_AUTO_DISMISS_MS = 4_000;

const HEADLINE: Record<SupportInAppNoticeType, { key: "support_notice_admin_replied" | "support_notice_case_resolved" | "support_notice_case_reopened"; ko: string; en: string }> = {
  support_admin_replied: { key: "support_notice_admin_replied", ko: "답변이 도착했어요", en: "You have a reply" },
  support_case_resolved: { key: "support_notice_case_resolved", ko: "상담이 종료되었어요", en: "Your inquiry was closed" },
  support_case_reopened: { key: "support_notice_case_reopened", ko: "상담이 다시 열렸어요", en: "Your inquiry was reopened" },
};

/**
 * Phase 3 D1 — top in-app banner for Support (app open). Layout/tokens mirror
 * `MessengerInAppMessageBannerHost`; separate host because Support ≠ Messenger.
 */
export function SupportInAppNoticeHost() {
  const { safeT } = useI18n();
  const notice = useSyncExternalStore(
    subscribeSupportInAppNotice,
    getSupportInAppNotice,
    () => null
  );

  useEffect(() => {
    if (!notice) return;
    const updatedAt = notice.updatedAt;
    const remain = Math.max(0, SUPPORT_IN_APP_NOTICE_AUTO_DISMISS_MS - (Date.now() - updatedAt));
    const t = window.setTimeout(() => {
      if (getSupportInAppNotice()?.updatedAt === updatedAt) dismissSupportInAppNotice();
    }, remain);
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  const headline = HEADLINE[notice.type];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]"
      role="status"
      aria-live="polite"
      data-support-in-app-notice={notice.type}
    >
      <div className="pointer-events-auto flex max-w-lg min-w-0 flex-1 items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 shadow-sam-elevated">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            dismissSupportInAppNotice();
            deliverSupportOpen({
              caseId: notice.caseId,
              notificationId: notice.notificationId || null,
              source: "banner",
            });
          }}
        >
          <p className={`truncate font-semibold text-sam-fg ${Sam.text.bodySecondary}`}>
            {safeT("support_center_brand_title", { fallbackKo: "DIBAY 고객센터", fallbackEn: "DIBAY Support" })}
            {" · "}
            {safeT(headline.key, { fallbackKo: headline.ko, fallbackEn: headline.en })}
          </p>
          {notice.preview ? (
            <p className={`mt-0.5 line-clamp-2 text-sam-muted ${Sam.text.helper}`}>{notice.preview}</p>
          ) : null}
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-full px-2 py-1 font-medium text-sam-muted hover:bg-sam-app ${Sam.text.helper}`}
          onClick={dismissSupportInAppNotice}
        >
          {safeT("common_close", { fallbackKo: "닫기", fallbackEn: "Close" })}
        </button>
      </div>
    </div>
  );
}
