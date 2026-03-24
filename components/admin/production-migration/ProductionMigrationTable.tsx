"use client";

import { useMemo, useState } from "react";
import { getProductionMigrationTables } from "@/lib/production-migration/mock-production-migration-tables";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getDomainLabel,
  getTableStatusLabel,
} from "@/lib/production-migration/production-migration-utils";
import type {
  ProductionMigrationDomain,
  ProductionTableStatus,
} from "@/lib/types/production-migration";

export function ProductionMigrationTable() {
  const [domain, setDomain] = useState<ProductionMigrationDomain | "">("");
  const tables = useMemo(
    () =>
      getProductionMigrationTables(
        domain ? { domain: domain as ProductionMigrationDomain } : undefined
      ),
    [domain]
  );

  const domains: { value: ProductionMigrationDomain | ""; label: string }[] = [
    { value: "", label: "전체" },
    { value: "auth", label: "Auth" },
    { value: "user", label: "User" },
    { value: "product", label: "Product" },
    { value: "chat", label: "Chat" },
    { value: "report", label: "Report" },
    { value: "point", label: "Point" },
    { value: "ad", label: "Ad" },
    { value: "ops", label: "Ops" },
    { value: "recommendation", label: "Recommendation" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">도메인</span>
        <select
          value={domain}
          onChange={(e) =>
            setDomain((e.target.value || "") as ProductionMigrationDomain | "")
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

      {tables.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 도메인 테이블이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "도메인",
            "테이블",
            "상태",
            "RLS",
            "인덱스",
            "트리거",
            "뷰",
            "RPC",
            "담당",
            "차단/비고",
          ]}
        >
          {tables.map((t) => (
            <tr
              key={t.id}
              className={`border-b border-gray-100 ${
                t.blockerReason ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getDomainLabel(t.domain)}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {t.tableName}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    t.status === "production_ready"
                      ? "bg-emerald-100 text-emerald-800"
                      : t.status === "mock_only"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getTableStatusLabel(t.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.hasRls ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.hasIndexes ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.hasTriggers ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.hasViews ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.hasRpc ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[180px] px-3 py-2.5 text-[13px] text-gray-500">
                {t.blockerReason || t.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
