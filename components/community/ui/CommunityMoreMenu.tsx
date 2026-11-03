"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";
import { resolveCommunityDetailBackHref } from "@/lib/community/community-post-entry-nav";
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
import { DIBAY_TOAST_ACTION_MS, DIBAY_TOAST_MS, OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

type Props = {
  postId: string;
  /** Null for imported posts — peer follow/block CTAs hidden. */
  targetUserId?: string | null;
  canReport?: boolean;
  onReport?: () => void;
};

export function CommunityMoreMenu({ postId, targetUserId, canReport, onReport }: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const requireAction = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  /** 재감사 S-2 (G-8 마무리): 메뉴가 열려 있으면 팝업 광고를 띄우지 않는다 */
  useRegisterOpenOverlay(open);
  const [mounted, setMounted] = useState(false);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undoHide, setUndoHide] = useState<(() => void) | null>(null);
  const peerId = typeof targetUserId === "string" ? targetUserId.trim() : "";
  const hasMemberPeer = Boolean(peerId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast(message);
    setUndoHide(undo ? () => undo : null);
    window.setTimeout(() => {
      setToast(null);
      setUndoHide(null);
    }, undo ? DIBAY_TOAST_ACTION_MS : DIBAY_TOAST_MS);
  }, []);

  const load = useCallback(async () => {
    if (!me?.id || !peerId || me.id === peerId) return;
    try {
      const relation = await fetchCommunityUserRelationSnapshot(peerId);
      setFollowing(relation.following);
      setBlocked(relation.blocked === true);
    } catch {
      /* ignore */
    }
  }, [me?.id, peerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
    if (!hasMemberPeer) return;
    if (!me?.id) {
      void requireAction("friend_add", () => undefined);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/community/neighbor-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerId }),
      });
      const j = (await res.json()) as { ok?: boolean; following?: boolean };
      invalidateCommunityUserRelationSnapshot(peerId);
      if (j.ok && typeof j.following === "boolean") setFollowing(j.following);
      else await load();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const toggleBlock = async () => {
    if (!hasMemberPeer) return;
    if (!me?.id) {
      void requireAction("community_report", () => undefined);
      return;
    }
    const nextBlocked = !blocked;
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
    setBusy(true);
    try {
      const res = await fetch("/api/community/block-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: peerId }),
      });
      const j = (await res.json()) as { ok?: boolean; blocked?: boolean };
      invalidateCommunityUserRelationSnapshot(peerId);
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
        /** 숨긴 글에서 이탈 — 상세 뒤로 계약(피드 출처) 그대로, 직전 기록이면 back 아니면 replace */
        runFixedDestinationBack(router, resolveCommunityDetailBackHref({ postId }));
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

  if (hasMemberPeer && me?.id === peerId) return null;
  if (!postId) return null;

  const itemClass = OverlayUi.popoverItem;

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
              className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden max-w-[min(92vw,280px)] rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[color:var(--overlay-text-primary)] shadow-[var(--overlay-elevation-2)] sm:min-w-[12rem]"
              role="menu"
            >
              {hasMemberPeer ? (
                <li role="none">
                  <button type="button" role="menuitem" disabled={busy} className={itemClass} onClick={() => void toggleFollow()}>
                    {following ? t("community_neighbor_follow_remove") : t("community_neighbor_follow_add")}
                  </button>
                </li>
              ) : null}
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
              {hasMemberPeer ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className={OverlayUi.popoverItemDanger}
                    onClick={() => void toggleBlock()}
                  >
                    {blocked ? t("community_unblock_neighbor") : t("community_block_neighbor")}
                  </button>
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
      </div>
      {toast ? (
        <DibayToast
          message={toast}
          action={undoHide ? { label: t("community_post_hide_undo"), onPress: () => void undoHide() } : null}
        />
      ) : null}
    </>
  );
}
