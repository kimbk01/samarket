"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 기존 /admin/community/reports 와 통합 목록을 쓰세요. */
export function AdminCommunityReportsTable() {
  const { t: tr } = useI18n();
  return <p className="sam-text-body text-sam-muted">{tr("admin_feed_reports_redirect_note")}</p>;
}
