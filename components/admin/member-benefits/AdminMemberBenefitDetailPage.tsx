"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import type { MemberBenefitLog, MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { AdminMemberBenefitForm } from "./AdminMemberBenefitForm";
import { AdminMemberBenefitLogList } from "./AdminMemberBenefitLogList";

interface AdminMemberBenefitDetailPageProps {
  policyId: string;
}

export function AdminMemberBenefitDetailPage({ policyId }: AdminMemberBenefitDetailPageProps) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<MemberBenefitPolicy | null>(null);
  const [logs, setLogs] = useState<MemberBenefitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/member-benefits/${encodeURIComponent(policyId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        policy?: MemberBenefitPolicy;
        logs?: MemberBenefitLog[];
      };
      if (j.ok && j.policy) {
        setPolicy(j.policy);
        setLogs(j.logs ?? []);
      } else {
        setPolicy(null);
      }
    } catch {
      setErr("정책을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (!policy) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_member_benefit_k5c666c65" backHref="/admin/member-benefits" />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          정책을 찾을 수 없습니다.
        </div>
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
    const ok = await patchPolicy({ ...policy, ...values });
    if (ok) setEditing(false);
  };

  const handleToggleActive = async () => {
    await patchPolicy({ isActive: !policy.isActive });
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_member_benefit_k5c666c65" backHref="/admin/member-benefits" />
      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}

      <AdminCard titleKey="admin_member_benefit_k5c666c65">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="sam-text-body font-semibold text-sam-fg">{policy.title}</p>
            <p className="sam-text-body-secondary text-sam-muted">
              {MEMBER_TYPE_LABELS[policy.memberType]} · {policy.isActive ? "활성" : "비활성"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary"
            >
              {editing ? "취소" : "수정"}
            </button>
            <button
              type="button"
              onClick={() => void handleToggleActive()}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary"
            >
              {policy.isActive ? "비활성화" : "활성화"}
            </button>
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
