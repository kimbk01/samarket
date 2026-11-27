"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityMessengerDiscoverableGroupSummary } from "@/lib/community-messenger/types";

export function DiscoverableOpenGroupCard({
  group,
  busy,
  onJoin,
}: {
  group: CommunityMessengerDiscoverableGroupSummary;
  busy: boolean;
  onJoin: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 shadow-[var(--messenger-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
            {group.title}
          </p>
          <p className="mt-1 line-clamp-2 sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.summary || t("cm_ui_open_group_no_intro")}
          </p>
          <p className="mt-1.5 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.ownerLabel} · {t("nav_messenger_open_group")} ·{" "}
            {t("nav_chat_count_people", { count: group.memberCount })}
            {group.isJoined ? ` · ${t("cm_ui_participant_status_joined")}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-primary-soft)] px-3 py-2 sam-text-helper font-semibold text-[color:var(--messenger-primary)] disabled:opacity-40 active:opacity-90"
          >
            {busy
              ? t("nav_messenger_checking")
              : group.isJoined
                ? t("cm_ui_open_group_reenter")
                : t("cm_ui_open_group_join")}
          </button>
        </div>
      </div>
    </div>
  );
}
