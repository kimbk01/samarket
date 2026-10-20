"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import type { MemberBenefitPolicy, MemberBenefitSummary } from "@/lib/types/member-benefit";
import { AdminMemberBenefitTable } from "./AdminMemberBenefitTable";
import { AdminMemberBenefitForm } from "./AdminMemberBenefitForm";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

export function AdminMemberBenefitPage() {
  const { t } = useI18n();
  const [policies, setPolicies] = useState<MemberBenefitPolicy[]>([]);
  const [summaries, setSummaries] = useState<MemberBenefitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/member-benefits", { cache: "no-store", credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        policies?: MemberBenefitPolicy[];
        summaries?: MemberBenefitSummary[];
      };
      if (j.ok) {
        setPolicies(j.policies ?? []);
        setSummaries(j.summaries ?? []);
      }
    } catch {
      setErr("회원 혜택 정책을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (values: Partial<MemberBenefitPolicy>) => {
    const res = await fetch("/api/admin/member-benefits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setErr("정책 저장에 실패했습니다.");
      return;
    }
    setShowForm(false);
    await load();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_member_benefit_k98edcb0c" />

      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}

      <AdminCard titleKey="admin_member_benefit_summary_2">
        <div className="flex flex-wrap gap-4 sam-text-body">
          {summaries.map((s) => (
            <div key={s.memberType} className="rounded border border-sam-border bg-sam-app px-3 py-2">
              <span className="font-medium text-sam-fg">{MEMBER_TYPE_LABELS[s.memberType]}</span>
              <span className="ml-2 text-sam-muted">
                활성 정책 {s.activePolicyCount}건 · 로그 {s.totalAppliedLogs}건
              </span>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_member_benefit_kdff18da4">
        <div className="mb-3 flex justify-end">
          <AdminActionButton
            onClick={() => setShowForm(true)}
            variant="secondary"
            size="sm"
          >
            정책 추가
          </AdminActionButton>
        </div>
        {showForm && (
          <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
            <AdminMemberBenefitForm onSubmit={(v) => void handleSave(v)} onCancel={() => setShowForm(false)} />
          </div>
        )}
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <AdminMemberBenefitTable policies={policies} />
        )}
      </AdminCard>
    </div>
  );
}
