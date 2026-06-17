"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import {
  fetchCommunityUserRelationSnapshot,
  invalidateCommunityUserRelationSnapshot,
} from "@/lib/community/user-relation-client";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";
import {
  CM_BTN_PILL_PRIMARY_CLASS,
  CM_NEIGHBOR_PROMPT_CLASS,
} from "@/lib/community/community-ui-classes";

type Props = {
  authorName: string;
  targetUserId: string;
};

export function CommunityNeighborPrompt({ authorName, targetUserId }: Props) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [theyBlocked, setTheyBlocked] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    if (!me?.id || !targetUserId || me.id === targetUserId) return;
    try {
      const relation = await fetchCommunityUserRelationSnapshot(targetUserId);
      setFollowing(relation.following);
      setTheyBlocked(relation.blocked === true);
    } catch {
      /* ignore */
    }
  }, [me?.id, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!me?.id) {
      void requireAction("friend_add", () => undefined);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/community/neighbor-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const j = (await res.json()) as { ok?: boolean; following?: boolean };
      invalidateCommunityUserRelationSnapshot(targetUserId);
      if (j.ok && typeof j.following === "boolean") setFollowing(j.following);
      else await load();
    } finally {
      setBusy(false);
    }
  };

  if (!targetUserId || me?.id === targetUserId || theyBlocked) return null;

  const name = communityAuthorDisplayName(authorName, t("community_member_fallback"));

  return (
    <div className={`${CM_NEIGHBOR_PROMPT_CLASS} mt-4 flex flex-wrap items-center justify-between gap-3`}>
      <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[var(--cm-text)]">
        {t("community_neighbor_prompt", { name })}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={
          following
            ? "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--cm-primary)] bg-[var(--cm-card-bg)] px-5 text-[13px] font-semibold text-[var(--cm-primary)]"
            : CM_BTN_PILL_PRIMARY_CLASS
        }
      >
        {following ? t("community_neighbor_following_label") : t("community_neighbor_follow_add")}
      </button>
    </div>
  );
}
