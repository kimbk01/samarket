"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MeetingMembersList({ labels }: { labels: { userId: string; name: string }[] }) {
  const { t } = useI18n();
  if (!labels.length) return <p className="sam-text-body text-sam-muted">{t("community_no_members")}</p>;
  return (
    <ul className="divide-y divide-sam-border-soft">
      {labels.map((m) => (
        <li key={m.userId} className="py-2 sam-text-body text-sam-fg">
          {m.name}
        </li>
      ))}
    </ul>
  );
}
