"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NeighborFollowButton, useNeighborFollowToggle } from "@/components/community/ui/NeighborFollowButton";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";
import { CM_NEIGHBOR_PROMPT_CLASS } from "@/lib/community/community-ui-classes";

type Props = {
  authorName: string;
  targetUserId: string;
  /** 글 상세 첫 데이터(`post.viewer`) — 있으면 별도 조회 없이 시작 (설계 A · 감사 E11) */
  seed?: { following?: boolean | null; blocked?: boolean | null };
};

/** 글 상세 본문 아래 「○○님과 관심이웃을 맺어보세요」 — ⋯ 메뉴와 같은 상태(`neighbor-follow-store`) */
export function CommunityNeighborPrompt({ authorName, targetUserId, seed }: Props) {
  const { t } = useI18n();
  const name = communityAuthorDisplayName(authorName, t("community_member_fallback"));
  const action = useNeighborFollowToggle({ targetUserId, name, seed });

  if (!targetUserId || !action.isPeer || !action.isSignedIn || action.blocked === true) return null;

  return (
    <>
      <div className={`${CM_NEIGHBOR_PROMPT_CLASS} mt-4 flex flex-wrap items-center justify-between gap-3`}>
        <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[var(--cm-text)]">
          {t("community_neighbor_prompt", { name })}
        </p>
        <NeighborFollowButton
          following={action.following}
          busy={action.busy}
          onPress={() => void action.toggle()}
          testId="community-neighbor-prompt-button"
        />
      </div>
      {action.toastNode}
    </>
  );
}
