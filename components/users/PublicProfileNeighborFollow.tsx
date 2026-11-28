"use client";

import { NeighborFollowButton, useNeighborFollowToggle } from "@/components/community/ui/NeighborFollowButton";

/**
 * 공개 프로필 관심이웃 버튼 (시안 ⑥ · 레거시 진입점 = 프로필 [모아보기]).
 * 글 상세·내정보와 같은 상태(`neighbor-follow-store`)·같은 버튼. 본인·내가 차단한 회원이면 숨김.
 */
export function PublicProfileNeighborFollow({ targetUserId, name }: { targetUserId: string; name: string }) {
  const action = useNeighborFollowToggle({ targetUserId, name });
  if (!targetUserId || !action.isPeer || action.blocked === true) return null;
  return (
    <div className="mt-3">
      <NeighborFollowButton
        following={action.following}
        busy={action.busy}
        onPress={() => void action.toggle()}
        fullWidth
        testId="public-profile-neighbor-follow"
      />
      {action.toastNode}
    </div>
  );
}
