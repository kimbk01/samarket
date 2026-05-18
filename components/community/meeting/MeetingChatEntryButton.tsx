"use client";

import Link from "next/link";
import { philifeAppPaths } from "@domain/philife/paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MeetingChatEntryButton({
  meetingId,
  disabled,
}: {
  meetingId: string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const mid = String(meetingId ?? "").trim();
  if (!mid) return <p className="sam-text-body-secondary text-sam-muted">{t("community_meeting_info_missing")}</p>;
  if (disabled) {
    return <p className="sam-text-body-secondary text-sam-muted">{t("community_meeting_ended_no_entry")}</p>;
  }
  return (
    <Link
      href={philifeAppPaths.meeting(mid)}
      className="inline-block rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
    >
      {t("community_meeting_view")}
    </Link>
  );
}
