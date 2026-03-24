"use client";

import { useMemo, useState } from "react";
import { getQaTestSuites } from "@/lib/qa-board/mock-qa-test-suites";
import { getQaTestCases } from "@/lib/qa-board/mock-qa-test-cases";
import { AdminTable } from "@/components/admin/AdminTable";
import { getDomainLabel } from "@/lib/qa-board/qa-board-utils";
import type { QaTestDomain } from "@/lib/types/qa-board";

export function QaSuiteTable() {
  const [domain, setDomain] = useState<QaTestDomain | "">("");
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">영역</span>
        <select
          value={domain}
          onChange={(e) =>
            setDomain((e.target.value || "") as QaTestDomain | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          {domains.map((d) => (
            <option key={d.value || "all"} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {suites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 영역 스위트가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["영역", "제목", "설명", "Critical", "통과/전체"]}
        >
          {suites.map((s) => {
            const stat = casesBySuite[s.id];
            return (
              <tr key={s.id} className="border-b border-gray-100">
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {getDomainLabel(s.domain)}
                </td>
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {s.title}
                </td>
                <td className="max-w-[240px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                  {s.description}
                </td>
                <td className="px-3 py-2.5">
                  {s.isCritical ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[12px] text-red-800">
                      필수
                    </span>
                  ) : (
                    <span className="text-[13px] text-gray-500">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
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
