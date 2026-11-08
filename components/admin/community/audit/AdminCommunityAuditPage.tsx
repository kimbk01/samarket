"use client";

/**
 * 운영 기록 (설계 §C-20 · §E-7) — 커뮤니티 대상 관리자 조치: 누가 · 언제 · 무엇 · 대상 · 사유 · 전후 비교.
 * URL: targetType · targetId · actor · action · from/to(PHT) · (호환) period · page · size
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import Link from "next/link";
import { Fragment, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import {
  COMMUNITY_AUDIT_TARGET_LABELS,
  communityAuditActionLabel,
  communityAuditFieldLabel,
  communityAuditTargetHref,
  communityAuditTargetLabel,
} from "@/components/admin/community/audit/community-audit-labels";

const AUDIT_EXTRAS = ["targetType", "targetId", "actor", "action"] as const;

type AuditRow = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorNickname: string | null;
  targetType: string | null;
  targetId: string | null;
  action: string | null;
  actionLabelKey: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type AuditResponse = { ok?: boolean; error?: string; total?: number; rows?: AuditRow[] };

function display(v: unknown, t: (key: MessageKey) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? t("admin_community_audit_yes") : t("admin_community_audit_no");
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return `${formatAdminManilaDateTime(v)} PHT`;
    return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  if (typeof v === "number") return formatAdminNumber(v);
  return t("admin_community_audit_see_tech_details");
}

/** 전후 비교 — 알려진 필드만 이름을 붙여 보여 주고, 나머지는 기술 정보로 */
function Compare({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const { t } = useI18n();
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const known = keys
    .map((k) => ({ k, label: communityAuditFieldLabel(k, t) }))
    .filter((x): x is { k: string; label: string } => Boolean(x.label))
    .filter(({ k }) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null) || !before);
  return (
    <div className="space-y-2">
      {known.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_community_audit_no_changes")}</p>
      ) : (
        <table className="w-full max-w-2xl border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-sam-muted">
              <th className="py-1 pr-3 font-semibold">{t("admin_community_audit_col_field")}</th>
              <th className="py-1 pr-3 font-semibold">{t("admin_community_audit_col_before")}</th>
              <th className="py-1 font-semibold">{t("admin_community_audit_col_after")}</th>
            </tr>
          </thead>
          <tbody>
            {known.map(({ k, label }) => (
              <tr key={k} className="border-t border-sam-border-soft">
                <td className="py-1 pr-3 text-sam-muted">{label}</td>
                <td className="py-1 pr-3 [overflow-wrap:anywhere]">{display(before?.[k], t)}</td>
                <td className="py-1 [overflow-wrap:anywhere]">{display(after?.[k], t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <AdminTechDetails ko>
        <pre className="whitespace-pre-wrap">{JSON.stringify({ before, after }, null, 2)}</pre>
      </AdminTechDetails>
    </div>
  );
}

export function AdminCommunityAuditPage() {
  const { t } = useI18n();
  const q = useCommunityListQuery({ extras: AUDIT_EXTRAS });
  const [openId, setOpenId] = useState<string | null>(null);
  const actor = q.query.extras.actor;
  const targetId = q.query.extras.targetId;

  const { state, reload } = useCommunityAdminJson<AuditResponse>(`/api/admin/community/audit?${q.apiParams().toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const actorName = actor ? rows.find((r) => r.actorId === actor)?.actorNickname : null;

  return (
    <CommunityListShell
      title={t("admin_community_audit_title")}
      description={t("admin_community_audit_desc")}
      filterBar={
        <CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_community_audit_filter_target_type")}>
            <CommunitySelect
              value={q.query.extras.targetType}
              onChange={(v) => q.patch({ extras: { targetType: v, targetId: "" } })}
              options={[{ value: "", label: t("admin_community_audit_all") }, ...COMMUNITY_AUDIT_TARGET_LABELS.map((o) => ({ value: o.value, label: t(o.labelKey) }))]}
            />
          </CommunityFilterField>
          {actor ? (
            <CommunityFilterField label={t("admin_community_audit_col_actor")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {actorName || t("admin_community_audit_selected_admin")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("actor", "")}>
                  {t("admin_community_audit_actor_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {targetId ? (
            <CommunityFilterField label={t("admin_community_audit_col_target")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_community_audit_single_target")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("targetId", "")}>
                  {t("admin_community_audit_target_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={rows.length === 0}
        lq={q}
        onRetry={reload}
        emptyMessage={t("admin_community_audit_empty")}
        filteredEmptyMessage={t("admin_community_audit_filtered_empty")}
      >
        <CommunityTable head={[t("admin_community_audit_col_time_pht"), t("admin_community_audit_col_actor"), t("admin_community_audit_col_target"), t("admin_community_audit_col_action"), t("admin_community_audit_col_reason"), ""]}>
          {rows.map((r) => {
            const href = communityAuditTargetHref(r.targetType, r.targetId);
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="border-b border-sam-border-soft">
                  <td className={COMMUNITY_TD}>
                    <CommunityTimeCell iso={r.createdAt} absolute />
                  </td>
                  <td className={COMMUNITY_TD}>
                    {r.actorId && !actor ? (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        className="h-auto! justify-start! px-0! text-left"
                        title={t("admin_community_audit_filter_actor")}
                        onClick={() => q.setExtra("actor", r.actorId ?? "")}
                      >
                        {r.actorNickname || t("admin_community_dash_admin_fallback")}
                      </AdminActionButton>
                    ) : (
                      r.actorNickname || t("admin_community_dash_admin_fallback")
                    )}
                  </td>
                  <td className={COMMUNITY_TD}>
                    {href ? (
                      <Link href={communityDetailHref(href, q.selfHref)} className="font-medium text-sam-info hover:underline">
                        {communityAuditTargetLabel(r.targetType, t)}
                      </Link>
                    ) : (
                      communityAuditTargetLabel(r.targetType, t)
                    )}
                  </td>
                  <td className={COMMUNITY_TD}>{communityAuditActionLabel(r.action, t)}</td>
                  <td className={`${COMMUNITY_TD} max-w-[24rem] whitespace-pre-wrap`}>{r.reason || "—"}</td>
                  <td className={COMMUNITY_TD}>
                    <AdminActionButton variant="ghost" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                      {open ? t("admin_community_audit_collapse") : t("admin_community_audit_compare")}
                    </AdminActionButton>
                  </td>
                </tr>
                {open ? (
                  <tr className="border-b border-sam-border-soft bg-sam-app">
                    <td className="px-3 py-3" colSpan={6}>
                      <Compare before={r.before} after={r.after} />
                      <AdminTechDetails ko>
                        <div>
                          {r.action ?? "—"} · {r.targetType ?? "—"} / {r.targetId ?? "—"} · actor {r.actorId ?? "—"}
                        </div>
                      </AdminTechDetails>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}
