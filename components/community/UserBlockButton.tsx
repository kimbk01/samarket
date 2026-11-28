"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  fetchCommunityUserRelationSnapshot,
  invalidateCommunityUserRelationSnapshot,
} from "@/lib/community/user-relation-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { invalidateHomePostsCache } from "@/lib/posts/getPostsForHome";
import { applyBlockToNeighborRelation } from "@/lib/community/neighbor-follow-store";

/**
 * 공개 프로필 [차단]·[차단 해제].
 * - 지금 보는 회원 = 회원 상태 SSOT. 확인 중에는 그리지 않는다.
 * - 누름 처리는 **그 순간** 회원 id 를 읽는다 — 예전에는 비회원 분기에서 `requireAction(…, toggle)` 이 같은 낡은 `toggle` 을
 *   다시 불러, 캐시가 늦게 찬 화면에서 로그인 확인이 끝없이 반복됐다(감사 D1, 설계 v2 §5-1).
 * - 요청은 원하는 상태 지정 `{ targetUserId, blocked }` — 같은 요청을 두 번 보내도 반대 동작이 되지 않는다.
 */
export function UserBlockButton({ targetUserId }: { targetUserId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const membership = useClientMembershipState("user-block-button");
  const meId = membership.status === "member" ? membership.profile.id : null;
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!meId || !targetUserId || meId === targetUserId) return;
    try {
      const relation = await fetchCommunityUserRelationSnapshot(targetUserId);
      setBlocked((prev) => (prev === relation.blocked ? prev : relation.blocked));
    } catch {
      setBlocked((prev) => (prev === null ? prev : null));
    }
  }, [meId, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 현재 상태를 알면 그 값, 모르면(로그인 직후) 서버에서 한 번 읽는다. 읽지 못하면 아무것도 하지 않는다 */
  const runBlock = async (known: boolean | null): Promise<void> => {
    const uid = getCurrentUser()?.id ?? null;
    if (!uid || !targetUserId || uid === targetUserId) return;
    let current = known;
    if (current === null) {
      try {
        current = (await fetchCommunityUserRelationSnapshot(targetUserId)).blocked;
      } catch {
        current = null;
      }
      if (current === null) return;
      setBlocked(current);
    }
    const nextBlocked = !current;
    if (nextBlocked) {
      const ok = await dibayConfirm({
        title: t("popup_neighbor_block_title"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_block"),
        confirmTone: "destructive",
      });
      if (!ok) return;
    } else {
      const ok = await dibayConfirm({
        title: t("popup_q_unblock"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("popup_cta_unblock"),
      });
      if (!ok) return;
    }
    setBusy((prev) => (prev ? prev : true));
    try {
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, blocked: nextBlocked }),
      });
      const j = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string };
      invalidateCommunityUserRelationSnapshot(targetUserId);
      if (res.ok && j.ok && typeof j.blocked === "boolean") {
        const resolved = j.blocked;
        applyBlockToNeighborRelation(targetUserId, resolved);
        setBlocked((prev) => (prev === resolved ? prev : resolved));
        invalidateHomePostsCache();
        router.refresh();
      }
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  if (!targetUserId || membership.status === "checking" || meId === targetUserId) return null;

  if (!meId) {
    return (
      <button
        type="button"
        onClick={() => {
          void requireAction("community_report", () => runBlock(null));
        }}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg"
      >
        {t("community_block")}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || blocked === null}
      onClick={() => void runBlock(blocked)}
      className={`rounded-ui-rect border px-3 py-1.5 sam-text-helper disabled:opacity-50 ${
        blocked === true
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-sam-border bg-sam-surface text-sam-fg"
      }`}
    >
      {blocked === true ? t("community_unblock") : t("community_block")}
    </button>
  );
}
