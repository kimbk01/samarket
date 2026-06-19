"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { CM_BTN_TEXT_CLASS } from "@/lib/community/community-ui-classes";

type Props = {
  postId: string;
  targetUserId: string;
  canReport?: boolean;
  onReport?: () => void;
};

export function CommunityMoreMenu({ postId, targetUserId, canReport, onReport }: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoHide, setUndoHide] = useState<(() => void) | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast(message);
    setUndoHide(undo ? () => undo : null);
    window.setTimeout(() => {
      setToast(null);
      setUndoHide(null);
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    if (!me?.id || !targetUserId || me.id === targetUserId) return;
    try {
      const relation = await fetchCommunityUserRelationSnapshot(targetUserId);
      setFollowing(relation.following);
      setBlocked(relation.blocked === true);
    } catch {
      /* ignore */
    }
  }, [me?.id, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
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
      setOpen(false);
    }
  };

  const toggleBlock = async () => {
    if (!me?.id) {
      void requireAction("community_report", () => undefined);
      return;
    }
    const nextBlocked = !blocked;
    if (nextBlocked && !window.confirm(t("community_confirm_block_neighbor"))) return;
    if (!nextBlocked && !window.confirm(t("community_confirm_unblock_neighbor"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const j = (await res.json()) as { ok?: boolean; blocked?: boolean };
      invalidateCommunityUserRelationSnapshot(targetUserId);
      if (res.ok && j.ok && typeof j.blocked === "boolean") {
        setBlocked(j.blocked);
        if (j.blocked) {
          showToast(t("community_block_success_toast"));
          router.refresh();
        }
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const hidePost = async () => {
    if (!me?.id) {
      void requireAction("community_report", () => undefined);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(postId)}/hide`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; hidden?: boolean; error?: string };
      if (res.ok && j.ok && j.hidden) {
        showToast(t("community_post_hide_success"), async () => {
          await fetch(`/api/community/posts/${encodeURIComponent(postId)}/hide`, {
            method: "POST",
            credentials: "include",
          });
          router.refresh();
        });
        router.back();
        return;
      }
      showToast(
        safeT("community_engagement_action_failed", {
          fallbackKo: "잠시 후 다시 시도해 주세요.",
          fallbackEn: "Please try again in a moment.",
        })
      );
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (!targetUserId || me?.id === targetUserId) return null;

  const itemClass = `block w-full px-4 py-3 text-left ${CM_BTN_TEXT_CLASS} text-[var(--cm-text)] hover:bg-[var(--cm-page-bg)]`;

  return (
    <>
      <div className="relative shrink-0">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cm-text-secondary)] hover:bg-[var(--cm-page-bg)]"
          aria-label={t("community_more_aria")}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
        </button>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default bg-black/20"
              aria-label={t("common_close")}
              onClick={() => setOpen(false)}
            />
            <ul
              className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card-bg)] py-1 shadow-lg sm:min-w-[12rem]"
              role="menu"
            >
              <li role="none">
                <button type="button" role="menuitem" disabled={busy} className={itemClass} onClick={() => void toggleFollow()}>
                  {following ? t("community_neighbor_follow_remove") : t("community_neighbor_follow_add")}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" disabled={busy} className={itemClass} onClick={() => void hidePost()}>
                  {t("community_post_hide")}
                </button>
              </li>
              {canReport && onReport ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={itemClass}
                    onClick={() => {
                      setOpen(false);
                      onReport();
                    }}
                  >
                    {t("community_report_post")}
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className={`${itemClass} text-[var(--cm-danger)]`}
                  onClick={() => void toggleBlock()}
                >
                  {blocked ? t("community_unblock_neighbor") : t("community_block_neighbor")}
                </button>
              </li>
            </ul>
          </>
        ) : null}
      </div>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(5rem,var(--safe-bottom))] z-[120] flex justify-center px-4">
          <p className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-full bg-[#1f2937] px-4 py-2.5 text-[14px] font-medium text-white shadow-lg">
            <span>{toast}</span>
            {undoHide ? (
              <button type="button" className="shrink-0 font-semibold text-[#86efac]" onClick={() => void undoHide()}>
                {t("community_post_hide_undo")}
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
    </>
  );
}
