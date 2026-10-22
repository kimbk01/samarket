"use client";

import { useMemo } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type GroupMentionCandidate = {
  userId: string;
  mentionKey: string;
  label: string;
  avatarUrl: string | null;
};

function mentionKeyFromLabel(label: string): string {
  const first = label.trim().split(/\s+/)[0] ?? "";
  return first.replace(/^@/, "").slice(0, 32);
}

export function buildGroupMentionCandidates(
  members: CommunityMessengerProfileLite[],
  viewerUserId: string
): GroupMentionCandidate[] {
  const out: GroupMentionCandidate[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    if (!member.id || member.id === viewerUserId) continue;
    const label = member.label?.trim() || member.aliasProfile?.displayName?.trim() || "";
    const key = mentionKeyFromLabel(label);
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push({
      userId: member.id,
      mentionKey: key,
      label,
      avatarUrl: member.avatarUrl ?? member.aliasProfile?.avatarUrl ?? null,
    });
  }
  return out;
}

type GroupMentionAutocompleteProps = {
  open: boolean;
  query: string;
  candidates: GroupMentionCandidate[];
  activeIndex: number;
  onPick: (candidate: GroupMentionCandidate) => void;
};

export function GroupMentionAutocomplete({
  open,
  query,
  candidates,
  activeIndex,
  onPick,
}: GroupMentionAutocompleteProps) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 8);
    return candidates
      .filter(
        (c) =>
          c.mentionKey.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [candidates, query]);

  if (!open || !filtered.length) return null;

  return (
    <div
      className="absolute bottom-full left-0 z-[30] mb-2 w-full max-w-[min(100%,320px)] overflow-hidden rounded-ui-rect border border-[#006241]/20 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      role="listbox"
    >
      {filtered.map((candidate, index) => (
        <button
          key={candidate.userId}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(candidate);
          }}
          className={`flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2 text-left sam-text-body ${
            index === activeIndex ? "bg-[#EAF4EF] text-[#006241]" : "text-sam-fg active:bg-[#EAF4EF]"
          }`}
        >
          <span className="font-semibold">@{candidate.mentionKey}</span>
          <span className="truncate sam-text-helper text-sam-muted">{candidate.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Returns mention query after trailing `@`, or null when not in mention mode. */
export function extractActiveMentionQuery(draft: string, caret: number): string | null {
  const head = draft.slice(0, Math.max(0, caret));
  const at = head.lastIndexOf("@");
  if (at < 0) return null;
  const between = head.slice(at + 1);
  if (/\s/.test(between)) return null;
  return between;
}
