"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MESSENGER_QUICK_REACTION_KEYS } from "@/lib/community-messenger/message-actions/message-reaction-policy";

export type MessageReactionBarProps = {
  enabled: boolean;
  onPick: (reactionKey: string) => void;
  /** 6개 밖 이모지로 반응 — 이모지 피커를 연다 (Owner 2026-11-16 반응 확대) */
  onMore?: () => void;
};

export function MessageReactionBar(props: MessageReactionBarProps) {
  const { t } = useI18n();
  if (!props.enabled) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5 border-b border-neutral-200 px-2 py-2">
      {MESSENGER_QUICK_REACTION_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="flex h-10 min-w-[2.25rem] items-center justify-center bg-transparent text-xl active:opacity-60"
          onClick={() => props.onPick(k)}
          aria-label={t("cm_ui_reaction_pick_aria", { key: k })}
        >
          {k}
        </button>
      ))}
      {props.onMore ? (
        <button
          type="button"
          data-cm-reaction-more=""
          className="flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-xl text-[color:var(--overlay-text-secondary)] active:opacity-60"
          onClick={props.onMore}
          aria-label={t("cm_ui_reaction_more_aria")}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
