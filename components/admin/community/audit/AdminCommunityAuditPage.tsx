"use client";

/**
 * 운영 기록 (설계 §C-20 · §E-7) — 커뮤니티 대상 관리자 조치: 누가 · 언제 · 무엇 · 대상 · 사유 · 전후 비교.
 * URL: targetType · targetId · actor · action · period/from/to · page
 */
import Link from "next/link";
import { Fragment, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityPeriodFilter,
  CommunityResetFilters,
  CommunitySelect,
  CommunityTable,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
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

const PAGE_SIZE = 50;

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

function display(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return `${formatAdminManilaDateTime(v)} PHT`;
    return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  if (typeof v === "number") return v.toLocaleString();
  return "(자세한 값은 기술 정보)";
}

/** 전후 비교 — 알려진 필드만 이름을 붙여 보여 주고, 나머지는 기술 정보로 */
function Compare({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const known = keys
    .map((k) => ({ k, label: communityAuditFieldLabel(k) }))
    .filter((x): x is { k: string; label: string } => Boolean(x.label))
    .filter(({ k }) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null) || !before);
  return (
    <div className="space-y-2">
      {known.length === 0 ? (
        <p className="text-[13px] text-sam-muted">표시할 변경 항목이 없습니다.</p>
      ) : (
        <table className="w-full max-w-2xl border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-sam-muted">
              <th className="py-1 pr-3 font-semibold">항목</th>
              <th className="py-1 pr-3 font-semibold">변경 전</th>
              <th className="py-1 font-semibold">변경 후</th>
            </tr>
          </thead>
          <tbody>
            {known.map(({ k, label }) => (
              <tr key={k} className="border-t border-sam-border-soft">
                <td className="py-1 pr-3 text-sam-muted">{label}</td>
                <td className="py-1 pr-3 [overflow-wrap:anywhere]">{display(before?.[k])}</td>
                <td className="py-1 [overflow-wrap:anywhere]">{display(after?.[k])}</td>
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
  const q = useCommunityQueryState();
  const [openId, setOpenId] = useState<string | null>(null);
  const period = q.get("period");
  const actor = q.get("actor");
  const targetId = q.get("targetId");

  const params = new URLSearchParams();
  for (const k of ["targetType", "targetId", "actor", "action"]) if (q.get(k)) params.set(k, q.get(k));
  params.set("period", period || "all");
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((q.page - 1) * PAGE_SIZE));
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const { state, reload } = useCommunityAdminJson<AuditResponse>(
    customIncomplete ? null : `/api/admin/community/audit?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.rows ?? [] : [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const actorName = actor ? rows.find((r) => r.actorId === actor)?.actorNickname : null;

  return (
    <CommunityListShell
      title="운영 기록"
      description="커뮤니티에서 관리자가 한 조치를 누가·언제·무엇을·왜 했는지 확인합니다."
      filters={
        <>
          <CommunityFilterField label="대상 유형">
            <CommunitySelect
              value={q.get("targetType")}
              onChange={(v) => q.set({ targetType: v, targetId: null })}
              options={[{ value: "", label: "전체" }, ...COMMUNITY_AUDIT_TARGET_LABELS]}
            />
          </CommunityFilterField>
          <CommunityPeriodFilter
            period={period}
            from={q.get("from")}
            to={q.get("to")}
            onChange={(v) => q.set({ period: v.period, from: v.from, to: v.to })}
          />
          {actor ? (
            <CommunityFilterField label="처리자">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {actorName || "선택한 관리자"}
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ actor: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          {targetId ? (
            <CommunityFilterField label="대상">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                한 대상의 기록만
                <button type="button" className="text-sam-muted underline" onClick={() => q.set({ targetId: null })}>
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          <CommunityResetFilters onReset={() => q.reset()} />
        </>
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message="조건에 맞는 운영 기록이 없습니다." />
      ) : (
        <CommunityTable head={["시각 (PHT)", "처리자", "대상", "조치", "사유", ""]}>
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
                      <button
                        type="button"
                        className="text-left font-medium text-sky-800 hover:underline"
                        title="이 관리자의 기록만 보기"
                        onClick={() => q.set({ actor: r.actorId })}
                      >
                        {r.actorNickname || "관리자"}
                      </button>
                    ) : (
                      r.actorNickname || "관리자"
                    )}
                  </td>
                  <td className={COMMUNITY_TD}>
                    {href ? (
                      <Link href={communityDetailHref(href, q.selfHref)} className="font-medium text-sky-800 hover:underline">
                        {communityAuditTargetLabel(r.targetType)}
                      </Link>
                    ) : (
                      communityAuditTargetLabel(r.targetType)
                    )}
                  </td>
                  <td className={COMMUNITY_TD}>{communityAuditActionLabel(r.action)}</td>
                  <td className={`${COMMUNITY_TD} max-w-[24rem] whitespace-pre-wrap`}>{r.reason || "—"}</td>
                  <td className={COMMUNITY_TD}>
                    <AdminActionButton variant="ghost" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                      {open ? "접기" : "전후 비교"}
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
      )}
    </CommunityListShell>
  );
}
