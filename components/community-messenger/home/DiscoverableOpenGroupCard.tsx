"use client";

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
  return (
    <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 shadow-[var(--messenger-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
            {group.title}
          </p>
          <p className="mt-1 line-clamp-2 sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.summary || "소개 없음"}
          </p>
          <p className="mt-1.5 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.regionText || group.ownerLabel} · {group.categoryText || "모임"} · {group.memberCount}명
            {group.isJoined ? " · 참여 중" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-primary-soft)] px-3 py-2 sam-text-helper font-semibold text-[color:var(--messenger-primary)] disabled:opacity-40 active:opacity-90"
          >
            {busy ? "확인 중..." : group.isJoined ? "다시 입장" : group.meetingId ? "모임 보기" : "참여"}
          </button>
        </div>
      </div>
    </div>
  );
}
