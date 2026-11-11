"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import { MoimDetailScreen } from "@/components/moim/MoimDetailScreen";
import { MoimEmptyState, MoimListSkeleton, moimCls } from "@/components/moim/moim-ui";

/** 초대 링크 착지 /moim/i/[token] — 링크가 승인을 건너뛰지 않는다(설계 P4). 공개 페이지에 토큰을 넘겨 가입 */
export function MoimInviteLanding({ token }: { token: string }) {
  const { t } = useI18n();
  const [moimId, setMoimId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void moimApi.resolveInvite(token).then((r) => {
      if (!alive) return;
      if (r.ok) setMoimId(r.moimId);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState
          action={
            <Link href={moimRoutes.tab} className={`${moimCls.btnSecondary} ${moimCls.btnSm}`}>
              {t("moim_invite_landing_home_btn")}
            </Link>
          }
        >
          {t(moimErrorKey(error))}
        </MoimEmptyState>
      </div>
    );
  }
  if (!moimId) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={2} />
      </div>
    );
  }
  return <MoimDetailScreen moimId={moimId} inviteToken={token} />;
}
