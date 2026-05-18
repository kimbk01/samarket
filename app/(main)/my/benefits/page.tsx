"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyBenefitsPage() {
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
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("route_benefits_title")}
        subtitle={t("route_benefits_subtitle")}
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-body-secondary text-sam-muted">{t("benefits_member_tier_role_note")}</p>
          <div className="mt-1 flex items-center gap-2">
            {role === undefined ? (
              <span className="sam-text-body text-sam-meta">{t("common_loading")}</span>
            ) : role === null ? (
              <span className="sam-text-body text-sam-muted">{t("benefits_my_profile_login")}</span>
            ) : (
              <span className="rounded bg-sam-primary-soft px-2 py-1 sam-text-body font-medium text-foreground">
                {roleLabel(role)}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          {t("benefits_policy_db_notice")}
        </div>
        <div>
          <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("benefits_applied_section")}</h2>
          <MemberBenefitList policies={policies} emptyMessage={t("benefits_empty_registered")} />
        </div>
      </div>
    </div>
  );
}
