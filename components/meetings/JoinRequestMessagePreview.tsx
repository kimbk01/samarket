"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { parseMeetingJoinRequestMessage } from "@/lib/neighborhood/meeting-join-request-message";

export function JoinRequestMessagePreview({ text }: { text: string }) {
  const { t } = useI18n();
  const parsed = parseMeetingJoinRequestMessage(text);
  if (!parsed) {
    return (
      <p className="mt-2 whitespace-pre-wrap rounded-ui-rect bg-amber-50/90 px-2.5 py-2 sam-text-helper leading-relaxed text-sam-fg">
        {text || t("meeting_join_preview_empty")}
      </p>
    );
  }
  const rows: { k: string; v: string }[] = [
    { k: t("community_join_field_name"), v: parsed.nickname },
    { k: t("community_join_field_intro"), v: parsed.intro },
    { k: t("community_join_field_reason"), v: parsed.reason },
    { k: t("community_join_field_memo"), v: parsed.note },
  ];
  return (
    <dl className="mt-2 space-y-2 rounded-ui-rect border border-amber-100 bg-amber-50/60 px-2.5 py-2 sam-text-helper">
      {rows.map(({ k, v }) => (
        <div key={k}>
          <dt className="font-semibold text-amber-900/90">{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sam-fg">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
