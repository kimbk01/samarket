"use client";

import Link from "next/link";
import { Bell, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  kind: "all_read" | "empty";
};

export function NotificationInboxEmptyState({ kind }: Props) {
  const { t } = useI18n();
  const isAllRead = kind === "all_read";

  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sam-primary-soft text-sam-primary"
        aria-hidden
      >
        {isAllRead ? (
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
        ) : (
          <Bell className="h-8 w-8" strokeWidth={2} />
        )}
      </span>
      <p className="text-[16px] font-semibold text-sam-fg">
        {isAllRead ? t("notif_empty_all_read_title") : t("notif_empty_none_title")}
      </p>
      <p className="mt-1.5 max-w-[18rem] text-[13px] leading-snug text-sam-muted">
        {isAllRead ? t("notif_empty_all_read_body") : t("notif_empty_none_body")}
      </p>
      {!isAllRead ? (
        <Link
          href="/mypage/section/settings/notifications"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-sam-primary px-5 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          {t("notif_empty_open_settings")}
        </Link>
      ) : null}
    </div>
  );
}
