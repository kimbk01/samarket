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

export function UserBlockButton({ targetUserId }: { targetUserId: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    if (!me?.id || !targetUserId || me.id === targetUserId) return;
    try {
      const relation = await fetchCommunityUserRelationSnapshot(targetUserId);
      setBlocked(relation.blocked);
    } catch {
      setBlocked(null);
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
    if (!targetUserId || me.id === targetUserId) return;
    const nextBlocked = !blocked;
    if (
      nextBlocked &&
      !window.confirm("이 이웃을 차단할까요? 글과 댓글이 보이지 않게 됩니다.")
    ) {
      return;
    }
    if (
      !nextBlocked &&
      !window.confirm("차단을 해제할까요?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const j = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string };
      invalidateCommunityUserRelationSnapshot(targetUserId);
      if (res.ok && j.ok && typeof j.blocked === "boolean") {
        setBlocked(j.blocked);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!targetUserId || me?.id === targetUserId) return null;

  if (!me?.id) {
    return (
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg"
      >
        차단
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || blocked === null}
      onClick={() => void toggle()}
      className={`rounded-ui-rect border px-3 py-1.5 sam-text-helper disabled:opacity-50 ${
        blocked === true
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-sam-border bg-sam-surface text-sam-fg"
      }`}
    >
      {blocked === true ? "차단 해제" : "차단"}
    </button>
  );
}
