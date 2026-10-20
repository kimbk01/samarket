"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getQaTestSuites, getQaTestCases } from "@/lib/qa-board/qa-board-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { getDomainLabel } from "@/lib/qa-board/qa-board-utils";
import type { QaTestDomain } from "@/lib/types/qa-board";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["domain"] as const;

export function QaSuiteTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const domain = lq.query.extras.domain as QaTestDomain | "";
  const suites = useMemo(
    () =>
      getQaTestSuites(
        domain ? { domain: domain as QaTestDomain } : undefined
      ),
    [domain]
  );
  const casesBySuite = useMemo(() => {
    const map: Record<string, { passed: number; total: number }> = {};
    suites.forEach((s) => {
      const cases = getQaTestCases({ suiteId: s.id });
      const passed = cases.filter((c) => c.status === "passed").length;
      map[s.id] = { passed, total: cases.length };
    });
    return map;
  }, [suites]);

  const domains: { value: QaTestDomain | ""; label: string }[] = [
    { value: "", label: "전체" },
    { value: "auth", label: "Auth" },
    { value: "product", label: "Product" },
    { value: "feed", label: "Feed" },
    { value: "chat", label: "Chat" },
    { value: "moderation", label: "Moderation" },
    { value: "point_payment", label: "Point" },
    { value: "ads_business", label: "Ads" },
    { value: "admin_console", label: "Admin" },
    { value: "ops", label: "Ops" },
    { value: "security", label: "Security" },
  ];

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_qa_area")} name="domain" value={lq.query.extras.domain} onChange={(v) => lq.setExtra("domain", v)}>
          {domains.map((d) => (
            <option key={d.value || "all"} value={d.value}>
              {d.label}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      {suites.length === 0 ? (
        <AdminEmptyState ko={ko} message={"해당 영역 스위트가 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={["영역", "제목", "설명", "Critical", "통과/전체"]}
        >
          {suites.map((s) => {
            const stat = casesBySuite[s.id];
            return (
              <tr key={s.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {getDomainLabel(t, s.domain)}
                </td>
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {s.title}
                </td>
                <td className="max-w-[240px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {s.description}
                </td>
                <td className="px-3 py-2.5">
                  {s.isCritical ? (
                    <span className="rounded bg-sam-danger-soft px-1.5 py-0.5 sam-text-helper text-sam-danger">
                      필수
                    </span>
                  ) : (
                    <span className="sam-text-body-secondary text-sam-muted">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {stat ? `${stat.passed} / ${stat.total}` : "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
