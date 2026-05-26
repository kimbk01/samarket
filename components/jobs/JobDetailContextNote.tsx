"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { JobDetailDirection } from "@/lib/jobs/resolve-job-detail-direction";
import { TRADE_FB_DETAIL_META_HELP } from "@/lib/ui/trade-write-fb-ui";

export function JobDetailContextNote({ direction }: { direction: JobDetailDirection }) {
  const { t } = useI18n();
  const extra =
    direction === "hiring" ? t("ui_jobs_contact_hiring") : t("ui_jobs_contact_seeking");

  return (
    <div className={`space-y-1 ${TRADE_FB_DETAIL_META_HELP}`}>
      <p className="mb-0">{t("ui_jobs_contact_chat_note")}</p>
      <p className="mb-0">{extra}</p>
    </div>
  );
}
