"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { NEIGHBOR_FOLLOW_LIMIT } from "@/lib/community/neighbor-follow-contract";
import {
  ensureNeighborStoreViewer,
  setNeighborFollow,
  useNeighborRelation,
} from "@/lib/community/neighbor-follow-store";
import { DIBAY_TOAST_ACTION_MS, DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";

export type NeighborFollowNotify = (message: string, tone: "success" | "error", undo?: () => void) => void;

type ToastState = { message: string; tone: "success" | "error"; undo?: () => void } | null;

/**
 * 관심이웃 추가·해제 동작 하나 (설계 A) — 글 상세 안내·⋯ 메뉴·공개 프로필·내정보 관리 공통.
 * 상태는 `neighbor-follow-store` 한 곳, 결과는 토스트(해제는 [되돌리기]). 가입 미완료·비로그인은 기존 안내 경로.
 * `notify` 를 주면 그쪽(예: 내정보 토스트)으로, 없으면 이 훅의 `toastNode` 로 그린다.
 */
export function useNeighborFollowToggle(opts: {
  targetUserId: string | null | undefined;
  name: string;
  seed?: { following?: boolean | null; blocked?: boolean | null };
  notify?: NeighborFollowNotify;
  enabled?: boolean;
}) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  /**
   * 지금 보는 회원 = 회원 상태 SSOT(`useClientMembershipState`). 확인 중·비회원·본인이면 버튼 대상이 아니다
   * (설계 §1 「본인·비회원·탈퇴 프로필은 숨김」 · 감사 D7: 확인 전 `me=null` 을 「본인 아님」으로 보던 결함).
   */
  const membership = useClientMembershipState("neighbor-follow");
  const me = membership.status === "member" ? membership.profile : null;
  const target = String(opts.targetUserId ?? "").trim();
  const meId = me?.id ?? null;
  const isPeer = Boolean(target) && Boolean(meId) && meId !== target;
  const settled = membership.status !== "checking";
  /**
   * 계정이 바뀌면 이전 회원의 관심이웃 값을 비운다 — 아래 저장소 읽기(effect)보다 먼저 선언(effect 는 선언 순서로 실행).
   * 확인 중에는 부르지 않는다: 확인 전 null 로 다른 인스턴스가 정한 회원 값을 비우지 않게(재감사 minor-1).
   */
  useEffect(() => {
    if (settled) ensureNeighborStoreViewer(meId);
  }, [settled, meId]);
  const rel = useNeighborRelation(target, {
    enabled: opts.enabled !== false && isPeer && Boolean(me?.id),
    seed: opts.seed,
  });
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.undo ? DIBAY_TOAST_ACTION_MS : DIBAY_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const externalNotify = opts.notify;
  const notify = useCallback<NeighborFollowNotify>(
    (message, tone, undo) => {
      if (externalNotify) externalNotify(message, tone, undo);
      else setToast({ message, tone, undo });
    },
    [externalNotify],
  );

  const name = opts.name;
  /** [되돌리기]가 같은 동작을 다시 부르기 위한 참조 (useCallback 안 자기 참조 대신) */
  const runRef = useRef<(want: boolean, offerUndo: boolean) => Promise<void>>(async () => undefined);
  const run = useCallback(
    async (want: boolean, offerUndo: boolean): Promise<void> => {
      if (!target) return;
      if (!getCurrentUser()?.id) {
        void requireAction("friend_add", () => undefined);
        return;
      }
      const r = await setNeighborFollow(target, want);
      if (r.ok) {
        notify(
          t(want ? "community_neighbor_added_toast" : "community_neighbor_removed_toast", { name }),
          "success",
          !want && offerUndo ? () => void runRef.current(true, false) : undefined,
        );
        return;
      }
      /** 진행 중 재탭 · 가입 안내 창(전역 fetch 게이트)·로그인 만료는 다른 곳이 안내한다 */
      if (r.error === "busy" || r.error === "signup_incomplete" || r.status === 401) return;
      if (r.error === "neighbor_follow_limit") {
        notify(t("community_neighbor_limit_toast", { limit: NEIGHBOR_FOLLOW_LIMIT }), "error");
        return;
      }
      if (r.error === "blocked_target" || r.error === "target_unavailable") {
        notify(t("community_neighbor_unavailable_toast"), "error");
        return;
      }
      notify(t("community_engagement_action_failed"), "error");
    },
    [name, notify, requireAction, t, target],
  );
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const toggle = useCallback(() => run(rel.following !== true, true), [rel.following, run]);

  const toastNode: ReactNode = toast ? (
    <DibayToast
      message={toast.message}
      tone={toast.tone}
      action={
        toast.undo
          ? {
              label: t("community_post_hide_undo"),
              onPress: () => {
                const undo = toast.undo;
                setToast(null);
                undo?.();
              },
            }
          : null
      }
    />
  ) : null;

  return {
    /** 비로그인·본인이면 false — 버튼을 그리지 않는다 */
    isPeer,
    isSignedIn: Boolean(me?.id),
    following: rel.following,
    blocked: rel.blocked,
    busy: rel.busy,
    toggle,
    toastNode,
  };
}

/** [관심이웃 추가](주 버튼) ↔ [관심이웃 ✓](초록 테두리) — 시안 ③⑤⑥ */
export function NeighborFollowButton({
  following,
  busy,
  onPress,
  fullWidth = false,
  testId,
}: {
  following: boolean | null;
  busy: boolean;
  onPress: () => void;
  fullWidth?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const on = following === true;
  return (
    <button
      type="button"
      data-testid={testId ?? "neighbor-follow-button"}
      data-following={on ? "1" : "0"}
      aria-pressed={on}
      disabled={busy}
      aria-busy={busy}
      onClick={onPress}
      className={`${on ? `${Sam.btn.secondaryCombo} !border-sam-primary !bg-sam-surface !text-sam-primary` : Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} ${fullWidth ? "w-full" : "shrink-0"} inline-flex items-center justify-center gap-1 whitespace-nowrap disabled:opacity-60`}
    >
      {on ? (
        <>
          {t("community_neighbor_following_label")}
          <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </>
      ) : (
        t("community_neighbor_follow_add")
      )}
    </button>
  );
}
