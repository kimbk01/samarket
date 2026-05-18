"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MeetingRestrictedCard({ reason }: { reason: "kicked" | "banned" }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 overflow-hidden rounded-ui-rect border border-red-100 bg-sam-surface shadow-sm">
      <div className="flex items-center gap-3 bg-red-50 px-5 py-4">
        <span className="sam-text-hero">🚫</span>
        <div>
          <p className="sam-text-body font-bold text-red-900">{t("meeting_restricted_title")}</p>
          <p className="sam-text-helper text-red-600">
            {reason === "kicked" ? t("meeting_restricted_kicked") : t("meeting_restricted_banned")}
          </p>
        </div>
      </div>
    </div>
  );
}
