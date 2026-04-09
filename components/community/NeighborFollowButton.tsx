"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getCurrentUser,
  getHydrationSafeCurrentUser,
} from "@/lib/auth/get-current-user";
import {
  fetchCommunityUserRelationSnapshot,
  invalidateCommunityUserRelationSnapshot,
} from "@/lib/community/user-relation-client";

export function NeighborFollowButton({ targetUserId }: { targetUserId: string }) {
  const router = useRouter();
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
      setFollowing(null);
    }
  }, [me?.id, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!me?.id) {
      router.push("/login");
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

  if (!targetUserId || me?.id === targetUserId) return null;
  if (theyBlocked) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle()}
      className="rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12px] font-medium text-sky-900 disabled:opacity-50"
    >
      {following === true ? "관심이웃 해제" : "관심이웃 추가"}
    </button>
  );
}
