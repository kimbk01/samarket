"use client";

import { useMoimNotificationRead } from "@/lib/moim/use-moim-notification-read";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimReceivedInviteDto } from "@/lib/moim/moim-api-types";
import { MoimCard } from "@/components/moim/MoimCard";
import { MoimJoinSheet } from "@/components/moim/MoimJoinSheet";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";

/**
 * 초대 수락 본문 — 프로필 + (가입 신청이 되는 초대면) 가입 질문 답 (R3 U-13).
 * 질문이 없는 초대는 answers 를 보내지 않는다(DB 가 바로 가입·운영진 초대로 처리).
 */
export function moimInviteAcceptPayload(
  invite: Pick<MoimReceivedInviteDto, "joinQuestions">,
  v: { answers: string[]; nickname: string; bio: string }
): { nickname: string; bio: string; answers?: string[] } {
  return invite.joinQuestions.length > 0 ? { nickname: v.nickname, bio: v.bio, answers: v.answers } : { nickname: v.nickname, bio: v.bio };
}

/** 받은 초대 /moim/invites — 수락(프로필 확인 · 필요하면 가입 질문) · 거절 */
export function MoimInvitesScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useMoimToast();
  const [invites, setInvites] = useState<MoimReceivedInviteDto[] | null>(null);
  /** R2 N-06: 이 화면으로 가는 모임 알림 읽음 (정책 §2) */
  useMoimNotificationRead("/moim/invites", invites !== null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const [accepting, setAccepting] = useState<MoimReceivedInviteDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const header = useMemo(() => ({ titleText: t("moim_invites_title"), backHref: moimRoutes.tab }), [t]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void moimApi.receivedInvites().then((r) => {
      if (!alive) return;
      if (r.ok) setInvites(r.invites);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const decline = async (inv: MoimReceivedInviteDto) => {
    /** R3 G-dng-04: 거절 = 위험 — 확인창도 destructive */
    const ok = await dibayConfirm({
      title: t("moim_invites_decline_confirm_title"),
      confirmLabel: t("common_reject"),
      cancelLabel: t("common_cancel"),
      confirmTone: "destructive",
    });
    if (!ok) return;
    setBusyId(inv.id);
    const r = await moimApi.respondInvite(inv.id, false);
    setBusyId(null);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setKey((k) => k + 1);
  };

  const accept = async (v: { answers: string[]; nickname: string; bio: string }) => {
    if (!accepting) return null;
    const r = await moimApi.respondInvite(accepting.id, true, moimInviteAcceptPayload(accepting, v));
    if (!r.ok) return t(moimErrorKey(r.error));
    const moimId = r.moim_id ?? accepting.moim.id;
    setAccepting(null);
    if (r.status === "pending") {
      toast.show(t("moim_join_requested_toast"), "success");
      setKey((k) => k + 1);
    } else {
      router.push(moimRoutes.home(moimId));
    }
    return null;
  };

  return (
    <div className={`${moimCls.page} pb-10`}>
      <div className={`${moimCls.column} pt-3`}>
        {failed ? (
          <MoimErrorState onRetry={() => setKey((k) => k + 1)} />
        ) : invites === null ? (
          <MoimListSkeleton />
        ) : invites.length === 0 ? (
          <MoimEmptyState>{t("moim_invites_empty")}</MoimEmptyState>
        ) : (
          <div className="grid gap-3 px-4">
            {invites.map((inv) => (
              <div key={inv.id} className="grid gap-2">
                <p className="text-[12.5px] text-sam-muted">
                  {t("moim_invites_from", { name: inv.inviterNickname })} · {formatRelativeTimeAgo(inv.createdAt, language)}
                </p>
                <MoimCard moim={inv.moim} />
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === inv.id} className={`${moimCls.btnDanger} ${moimCls.btnSm} flex-1`} onClick={() => void decline(inv)}>
                    {t("common_reject")}
                  </button>
                  {/* 줄마다 반복되는 수락 = 보조 (D-31 · R3 G-pri-07) */}
                  <button type="button" disabled={busyId === inv.id} className={`${moimCls.btnSecondary} ${moimCls.btnSm} flex-1`} onClick={() => setAccepting(inv)}>
                    {t("common_accept")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <MoimJoinSheet
        open={accepting != null}
        onClose={() => setAccepting(null)}
        title={accepting?.joinQuestions.length ? t("moim_join_request_title") : t("moim_join_title")}
        submitLabel={t("moim_invites_accept_btn")}
        questions={accepting?.joinQuestions ?? []}
        onSubmit={accept}
      />
      {toast.node}
    </div>
  );
}
