"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

export function UserBlockButton({ targetUserId }: { targetUserId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
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
      setBlocked((prev) => (prev === relation.blocked ? prev : relation.blocked));
    } catch {
      setBlocked((prev) => (prev === null ? prev : null));
    }
  }, [me?.id, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!me?.id) {
      await requireAction("community_report", toggle);
      return;
    }
    if (!targetUserId || me.id === targetUserId) return;
    const nextBlocked = !blocked;
    if (nextBlocked) {
      const ok = await dibayConfirm({
        title: t("community_confirm_block_neighbor"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_confirm"),
        confirmTone: "destructive",
      });
      if (!ok) return;
    } else {
      const ok = await dibayConfirm({
        title: t("community_confirm_unblock_neighbor"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_confirm"),
      });
      if (!ok) return;
    }
    setBusy((prev) => (prev ? prev : true));
    try {
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const j = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string };
      invalidateCommunityUserRelationSnapshot(targetUserId);
      if (res.ok && j.ok && typeof j.blocked === "boolean") {
        const nextBlocked = j.blocked;
        setBlocked((prev) => (prev === nextBlocked ? prev : nextBlocked));
        router.refresh();
      }
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  if (!targetUserId || me?.id === targetUserId) return null;

  if (!me?.id) {
    return (
      <button
        type="button"
        onClick={() => {
          void requireAction("community_report", toggle);
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
      onClick={() => void toggle()}
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
