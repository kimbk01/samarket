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
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

export function AdminMemberBenefitPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [policies, setPolicies] = useState<MemberBenefitPolicy[]>([]);
  const [summaries, setSummaries] = useState<MemberBenefitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState("");
  /** 불러오기 실패 — 표준 오류 상태 (저장 오류 `err` 와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/member-benefits", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        policies?: MemberBenefitPolicy[];
        summaries?: MemberBenefitSummary[];
      };
      if (!res.ok || !j.ok) {
        setLoadErr({ code: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setLoadErr(null);
      setPolicies(j.policies ?? []);
      setSummaries(j.summaries ?? []);
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (values: Partial<MemberBenefitPolicy>) => {
    // 정책 등록 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "회원 혜택 정책 등록" : "Create member benefit policy",
      description: values.title ? String(values.title) : undefined,
      confirmLabel: adminCta("create", ko),
    });
    if (!confirmed.ok) return;
    setErr("");
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
          <AdminLoadingState ko={ko} label={t("common_loading")} />
        ) : loadErr ? (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />
        ) : (
          <AdminMemberBenefitTable policies={policies} />
        )}
      </AdminCard>
    </div>
  );
}
