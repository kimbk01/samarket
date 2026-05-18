"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export default function MypageBenefitsPage() {
  const { t } = useI18n();
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

  function roleLabel(roleValue: string | null | undefined): string {
    const r = (roleValue ?? "").toLowerCase();
    if (r === "admin" || r === "super_admin") return t("benefits_role_admin");
    if (r === "store_owner" || r === "business") return t("benefits_role_business");
    return t("benefits_role_general");
  }

  const policies: MemberBenefitPolicy[] = [];

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
              {role === undefined ? (
                <span className="sam-text-body text-sam-meta">{t("common_loading")}</span>
              ) : role === null ? (
                <span className="sam-text-body text-sam-muted">{t("benefits_login_prompt")}</span>
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
            {t("benefits_policy_notice")}
          </div>
          <div>
            <h2 className="mb-2 sam-text-section-title text-sam-fg">{t("benefits_applied_section")}</h2>
            <MemberBenefitList policies={policies} emptyMessage={t("benefits_empty_list")} />
          </div>
        </div>
      </div>
    </div>
  );
}
