"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

function roleLabel(role: string | null | undefined): string {
  const r = (role ?? "").toLowerCase();
  if (r === "admin" || r === "master") return "운영";
  if (r === "store_owner" || r === "business") return "사업자";
  return "일반";
}

export default function MypageBenefitsPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) {
      setRole(null);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setRole(null);
      return;
    }
    let cancelled = false;
    void sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRole(null);
          return;
        }
        setRole((data as { role?: string }).role ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const policies: MemberBenefitPolicy[] = [];

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader title="회원 혜택" subtitle="이벤트·프로모션" backHref="/mypage" hideCtaStrip />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-1 py-4">
        <div className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad`}>
          <p className="sam-text-body-secondary text-sam-muted">내 회원 구분</p>
          <div className="mt-1 flex items-center gap-2">
            {role === undefined ? (
              <span className="sam-text-body text-sam-meta">불러오는 중…</span>
            ) : role === null ? (
              <span className="sam-text-body text-sam-muted">로그인 후 회원 혜택을 확인할 수 있습니다.</span>
            ) : (
              <span className="rounded bg-sam-primary-soft px-2 py-1 sam-text-body font-medium text-foreground">
                {roleLabel(role)}
              </span>
            )}
          </div>
        </div>
        <div
          className={`${PHILIFE_FB_CARD_CLASS} border-amber-100 bg-amber-50/90 sam-card-pad sam-text-body-secondary text-amber-900`}
        >
          혜택 정책은 운영 데이터 기준으로 노출되며, 현재 등록된 정책만 표시합니다.
        </div>
        <div>
          <h2 className="mb-2 sam-text-section-title text-sam-fg">적용 혜택</h2>
          <MemberBenefitList
            policies={policies}
            emptyMessage="현재 적용 중인 혜택이 없습니다. 공지사항과 이벤트를 확인해 주세요."
          />
        </div>
        </div>
      </div>
    </div>
  );
}
