"use client";

import { MESSENGER_QUICK_REACTION_KEYS } from "@/lib/community-messenger/message-actions/message-reaction-policy";

export type MessageReactionBarProps = {
  enabled: boolean;
  onPick: (reactionKey: string) => void;
};

export function MessageReactionBar(props: MessageReactionBarProps) {
  if (!props.enabled) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5 border-b border-neutral-200 px-2 py-2 dark:border-neutral-700">
      {MESSENGER_QUICK_REACTION_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="flex h-10 min-w-[2.25rem] items-center justify-center bg-transparent text-xl active:opacity-60"
          onClick={() => props.onPick(k)}
          aria-label={`반응 ${k}`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
