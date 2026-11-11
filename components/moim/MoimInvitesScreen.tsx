"use client";

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

/** 받은 초대 /moim/invites — 수락(프로필 확인) · 거절 */
export function MoimInvitesScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useMoimToast();
  const [invites, setInvites] = useState<MoimReceivedInviteDto[] | null>(null);
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
    const ok = await dibayConfirm({ title: t("moim_invites_decline_confirm_title"), confirmLabel: t("common_reject"), cancelLabel: t("common_cancel") });
    if (!ok) return;
    setBusyId(inv.id);
    const r = await moimApi.respondInvite(inv.id, false);
    setBusyId(null);
    if (!r.ok) return toast.show(t(moimErrorKey(r.error)), "error");
    setKey((k) => k + 1);
  };

  const accept = async (v: { nickname: string; bio: string }) => {
    if (!accepting) return null;
    const r = await moimApi.respondInvite(accepting.id, true, { nickname: v.nickname, bio: v.bio });
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
                  <button type="button" disabled={busyId === inv.id} className={`${moimCls.btnSecondary} ${moimCls.btnSm} flex-1`} onClick={() => void decline(inv)}>
                    {t("common_reject")}
                  </button>
                  <button type="button" disabled={busyId === inv.id} className={`${moimCls.btnPrimary} ${moimCls.btnSm} flex-1`} onClick={() => setAccepting(inv)}>
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
        title={t("moim_join_title")}
        submitLabel={t("moim_invites_accept_btn")}
        questions={[]}
        onSubmit={accept}
      />
      {toast.node}
    </div>
  );
}
