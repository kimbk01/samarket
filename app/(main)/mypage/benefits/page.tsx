"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

type BenefitsState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error" }
  | { kind: "ready"; memberType: string; policies: MemberBenefitPolicy[] };

export default function MypageBenefitsPage() {
  const { t } = useI18n();
  const [state, setState] = useState<BenefitsState>({ kind: "loading" });

  /** D19 — 정책 SSOT(member_benefit_policies) 중 내 회원 구분에 적용되는 활성 정책만. 하드코딩 빈 배열 제거 */
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/benefits", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        memberType?: string;
        policies?: MemberBenefitPolicy[];
      };
      if (res.status === 401) {
        setState({ kind: "guest" });
        return;
      }
      if (!res.ok || !json.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({
        kind: "ready",
        memberType: json.memberType ?? "normal",
        policies: Array.isArray(json.policies) ? json.policies : [],
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function memberTypeLabel(memberType: string): string {
    if (memberType === "admin") return t("benefits_role_admin");
    if (memberType === "premium") return t("benefits_role_premium");
    return t("benefits_role_general");
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_benefits_title")}
        subtitle={t("route_benefits_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-1 py-4">
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad`}>
            <p className="sam-text-body-secondary text-sam-muted">{t("benefits_member_tier_label")}</p>
            <div className="mt-1 flex items-center gap-2">
              {state.kind === "loading" ? (
                <span className="sam-text-body text-sam-meta">{t("common_loading")}</span>
              ) : state.kind === "guest" ? (
                <span className="sam-text-body text-sam-muted">{t("benefits_login_prompt")}</span>
              ) : state.kind === "error" ? (
                <span className="sam-text-body text-sam-muted">—</span>
              ) : (
                <span className="rounded bg-sam-primary-soft px-2 py-1 sam-text-body font-medium text-foreground">
                  {memberTypeLabel(state.memberType)}
                </span>
              )}
            </div>
          </div>
          <div
            className={`${PHILIFE_FB_CARD_CLASS} border-amber-100 bg-amber-50/90 sam-card-pad sam-text-body-secondary text-amber-900`}
          >
            {t("benefits_policy_notice")}
          </div>
          <div>
            <h2 className="mb-2 sam-text-section-title text-sam-fg">{t("benefits_applied_section")}</h2>
            {state.kind === "error" ? (
              <div className="rounded-ui-rect bg-sam-surface p-8 text-center" role="alert">
                <p className="sam-text-body text-sam-muted">{t("benefits_load_failed")}</p>
                <button type="button" onClick={() => void load()} className="sam-btn sam-btn--secondary sam-btn--sm mt-4">
                  {t("common_retry")}
                </button>
              </div>
            ) : state.kind === "loading" ? (
              <p className="py-8 text-center sam-text-body text-sam-meta">{t("common_loading")}</p>
            ) : (
              <MemberBenefitList
                policies={state.kind === "ready" ? state.policies : []}
                emptyMessage={state.kind === "guest" ? t("benefits_login_prompt") : t("benefits_empty_list")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
