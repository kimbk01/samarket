"use client";

/**
 * ARO-OPS-UX-002-B2 — Shared Domain Dashboard shell (operator presentation).
 * Frequency taxonomy / raw owner keys / duplicate queues must not surface as primary UI.
 */

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";
import {
  adminOperatorLabel,
  adminRecentTitle,
} from "@/lib/admin/operator-ux/operator-labels";

function MetricGrid({
  items,
  ko,
  unavailableLabel,
}: {
  items: AdminDomainDashboardModel["currentState"];
  ko: boolean;
  unavailableLabel: string;
}) {
  if (!items.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {items.map((m) => {
        const body = (
          <>
            <p className="sam-text-helper text-sam-muted">{ko ? m.labelKo : m.labelEn}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-sam-fg">
              {m.value == null ? (
                <span className="text-sm font-bold text-amber-800">{unavailableLabel}</span>
              ) : (
                m.value
              )}
            </p>
          </>
        );
        const className =
          "min-h-[5.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3";
        if (m.href) {
          return (
            <Link
              key={m.id}
              href={m.href}
              prefetch={false}
              className={`${className} transition-colors hover:border-signature/40 hover:bg-sam-app`}
              data-admin-domain-metric={m.id}
              data-source={m.source}
            >
              {body}
            </Link>
          );
        }
        return (
          <div key={m.id} className={className} data-admin-domain-metric={m.id} data-source={m.source}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function ActionGrid({
  items,
  ko,
  unavailableLabel,
  emptyKo,
  emptyEn,
  ctaKo,
  ctaEn,
}: {
  items: AdminDomainDashboardModel["actionRequired"];
  ko: boolean;
  unavailableLabel: string;
  emptyKo: string;
  emptyEn: string;
  ctaKo: string;
  ctaEn: string;
}) {
  if (!items.length) {
    return (
      <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-6 text-center sam-text-body text-sam-muted">
        {ko ? emptyKo : emptyEn}
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          prefetch={false}
          className="flex min-h-[7rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-signature/40 hover:bg-sam-app"
          data-admin-domain-action={a.id}
          data-source={a.source}
          data-owner={a.owner}
        >
          <div>
            <p className="mt-1 text-[15px] font-semibold text-sam-fg">{ko ? a.labelKo : a.labelEn}</p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-sam-primary">{ko ? ctaKo : ctaEn}</span>
            {a.count == null ? (
              <span className="rounded-ui-rect border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {unavailableLabel}
              </span>
            ) : (
              <span className="rounded-full bg-sam-primary px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                {a.count}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function EntryList({
  items,
  ko,
}: {
  items: AdminDomainDashboardModel["primaryEntries"];
  ko: boolean;
}) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
      {items.map((e) => (
        <li key={e.id}>
          <Link
            href={e.href}
            prefetch={false}
            className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-sam-app"
            data-admin-domain-entry={e.id}
            data-frequency={e.frequency}
          >
            <span className="sam-text-body text-sam-fg">{ko ? e.labelKo : e.labelEn}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function dedupeIssuesAgainstActions(
  actionRequired: AdminDomainDashboardModel["actionRequired"],
  issues: AdminDomainDashboardModel["issues"]
): AdminDomainDashboardModel["issues"] {
  const actionIds = new Set(actionRequired.map((a) => a.id));
  const actionHrefs = new Set(actionRequired.map((a) => a.href));
  return issues.filter((i) => !actionIds.has(i.id) && !actionHrefs.has(i.href));
}

export function AdminDomainDashboardShell({
  model,
}: {
  model: AdminDomainDashboardModel;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  const unavailableLabel = ko ? "확인 불가" : "UNAVAILABLE";
  const uniqueIssues = dedupeIssuesAgainstActions(model.actionRequired, model.issues);

  return (
    <div
      className="space-y-5 text-sam-fg"
      data-admin-domain-dashboard={model.domain}
      data-aro-ops-ux-002-b2="1"
      data-operator-ux="1"
    >
      <header className="space-y-1" data-admin-cp-header="domain">
        <h1 className="sam-text-page-title font-semibold tracking-tight text-sam-fg">
          {ko ? model.titleKo : model.titleEn}
        </h1>
        <p className="sam-text-body text-sam-muted">
          {ko ? model.descriptionKo : model.descriptionEn}
        </p>
      </header>

      {model.sectionErrors.length > 0 ? (
        <div
          className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
          data-admin-domain-section-errors="1"
        >
          {ko ? "일부 정보를 불러오지 못했습니다." : "Some sources unavailable"}
        </div>
      ) : null}

      <section className="space-y-2" data-admin-domain-section="action-required">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ko ? "지금 처리할 일" : "Action required"}
        </h2>
        <ActionGrid
          items={model.actionRequired}
          ko={ko}
          unavailableLabel={unavailableLabel}
          emptyKo="지금 처리할 대기 항목이 없습니다."
          emptyEn="No actionable items right now."
          ctaKo="검토하기"
          ctaEn="Review"
        />
      </section>

      <section className="space-y-2" data-admin-domain-section="current-state">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ko ? "현재 운영 상태" : "Current state"}
        </h2>
        <MetricGrid items={model.currentState} ko={ko} unavailableLabel={unavailableLabel} />
      </section>

      {model.domainHealth.length > 0 ? (
        <section className="space-y-2" data-admin-domain-section="domain-health">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {ko ? "도메인 상태" : "Domain status"}
          </h2>
          <MetricGrid items={model.domainHealth} ko={ko} unavailableLabel={unavailableLabel} />
        </section>
      ) : null}

      {uniqueIssues.length > 0 ? (
        <section className="space-y-2" data-admin-domain-section="issues">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {ko ? "문제 / 신고" : "Issues / reports"}
          </h2>
          <ActionGrid
            items={uniqueIssues}
            ko={ko}
            unavailableLabel={unavailableLabel}
            emptyKo="이슈 없음"
            emptyEn="No issues"
            ctaKo="신고 검토"
            ctaEn="Review report"
          />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2" data-admin-domain-section="primary-entries">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {ko ? "빠른 관리" : "Quick management"}
          </h2>
          <EntryList items={model.primaryEntries} ko={ko} />
        </section>
        <section className="space-y-2" data-admin-domain-section="context-entries">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {ko ? "운영 관리 / 설정" : "Ops / settings"}
          </h2>
          <EntryList items={model.contextEntries} ko={ko} />
        </section>
      </div>

      {model.recent.length > 0 ? (
        <section className="space-y-2" data-admin-domain-section="recent">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {ko ? "최근 활동" : "Recent activity"}
          </h2>
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full min-w-[36rem] table-fixed text-left sam-text-body-secondary">
              <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
                <tr>
                  <th className="px-3 py-2">{ko ? "항목" : "Item"}</th>
                  <th className="px-3 py-2">{ko ? "내용" : "Detail"}</th>
                  <th className="px-3 py-2">{ko ? "시각" : "When"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sam-border-soft">
                {model.recent.map((r) => {
                  const title = adminRecentTitle(
                    r.title,
                    ko ? (r.metaKo || "최근 활동") : (r.metaEn || "Recent activity"),
                    r.metaEn || "Recent activity",
                    ko
                  );
                  const metaRaw = (ko ? r.metaKo : r.metaEn) || "";
                  const meta = metaRaw
                    .split(" · ")
                    .map((part) => adminOperatorLabel(part.trim(), ko))
                    .join(" · ");
                  return (
                    <tr key={r.id} className="hover:bg-sam-app/60">
                      <td className="truncate px-3 py-2">
                        {r.href ? (
                          <Link
                            href={r.href}
                            prefetch={false}
                            className="font-medium text-signature hover:underline"
                          >
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </td>
                      <td className="truncate px-3 py-2 text-sam-muted">{meta}</td>
                      <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                        {r.at ? new Date(r.at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
