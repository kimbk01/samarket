"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import type { MemberBenefitLog, MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { AdminMemberBenefitForm } from "./AdminMemberBenefitForm";
import { AdminMemberBenefitLogList } from "./AdminMemberBenefitLogList";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

interface AdminMemberBenefitDetailPageProps {
  policyId: string;
}

export function AdminMemberBenefitDetailPage({ policyId }: AdminMemberBenefitDetailPageProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [policy, setPolicy] = useState<MemberBenefitPolicy | null>(null);
  const [logs, setLogs] = useState<MemberBenefitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  /** 불러오기 실패 — 표준 오류 상태 (없는 정책 = 빈 상태, 저장 오류 `err` 와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/member-benefits/${encodeURIComponent(policyId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        policy?: MemberBenefitPolicy;
        logs?: MemberBenefitLog[];
      };
      if (j.ok && j.policy) {
        setLoadErr(null);
        setPolicy(j.policy);
        setLogs(j.logs ?? []);
      } else {
        setPolicy(null);
        // 404 = 없는 정책(빈 상태) · 그 외 = 불러오기 실패
        setLoadErr(
          res.status === 404 ? null : { code: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status }
        );
      }
    } catch {
      setLoadErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <AdminLoadingState ko={ko} label={t("common_loading")} />;
  }

  if (!policy) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_member_benefit_k5c666c65" backHref="/admin/member-benefits" />
        {loadErr ? (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />
        ) : (
          <AdminEmptyState ko={ko} message="정책을 찾을 수 없습니다." />
        )}
      </div>
    );
  }

  const patchPolicy = async (body: Partial<MemberBenefitPolicy>) => {
    const res = await fetch(`/api/admin/member-benefits/${encodeURIComponent(policyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr("저장에 실패했습니다.");
      return false;
    }
    await load();
    return true;
  };

  const handleSave = async (values: Partial<MemberBenefitPolicy>) => {
    // 정책 수정 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "회원 혜택 정책 저장" : "Save member benefit policy",
      description: policy.title,
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    const ok = await patchPolicy({ ...policy, ...values });
    if (ok) setEditing(false);
  };

  const handleToggleActive = async () => {
    // 활성화 = 되돌릴 수 있는 변경(L1) · 비활성화 = 사용 끄기(L1)
    const label = policy.isActive ? "비활성화" : "활성화";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(policy.isActive ? "disable" : "resume"),
      ko,
      title: ko ? `회원 혜택 정책 ${label}` : policy.isActive ? "Deactivate policy" : "Activate policy",
      description: policy.title,
      confirmLabel: label,
    });
    if (!confirmed.ok) return;
    await patchPolicy({ isActive: !policy.isActive });
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_member_benefit_k5c666c65" backHref="/admin/member-benefits" />
      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}

      <AdminCard titleKey="admin_member_benefit_k5c666c65">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="sam-text-body font-semibold text-sam-fg">{policy.title}</p>
            <p className="sam-text-body-secondary text-sam-muted">
              {MEMBER_TYPE_LABELS[policy.memberType]} · {policy.isActive ? "활성" : "비활성"}
            </p>
          </div>
          <div className="flex gap-2">
            <AdminActionButton
              onClick={() => setEditing((e) => !e)}
              variant="secondary"
              size="sm"
            >
              {editing ? "취소" : "수정"}
            </AdminActionButton>
            <AdminActionButton
              onClick={() => void handleToggleActive()}
              variant="secondary"
              size="sm"
            >
              {policy.isActive ? "비활성화" : "활성화"}
            </AdminActionButton>
          </div>
        </div>
        {editing ? (
          <AdminMemberBenefitForm
            initial={policy}
            onSubmit={(v) => void handleSave(v)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="sam-text-body text-sam-fg">{policy.description}</p>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_exposure_k14bf3e5b">
        <AdminMemberBenefitLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
