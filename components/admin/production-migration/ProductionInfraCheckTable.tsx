"use client";

import { useMemo, useState } from "react";
import { getProductionInfraChecks } from "@/lib/production-migration/mock-production-infra-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getInfraCategoryLabel,
  getInfraStatusLabel,
} from "@/lib/production-migration/production-migration-utils";
import type {
  ProductionInfraCategory,
  ProductionInfraCheckStatus,
} from "@/lib/types/production-migration";

export function ProductionInfraCheckTable() {
  const [category, setCategory] = useState<ProductionInfraCategory | "">("");
  const checks = useMemo(
    () =>
      getProductionInfraChecks(
        category
          ? { category: category as ProductionInfraCategory }
          : undefined
      ),
    [category]
  );

  const categories = [
    { value: "" as const, label: "전체" },
    { value: "storage_bucket" as const, label: "스토리지 버킷" },
    { value: "env_secret" as const, label: "Env/Secret" },
    { value: "webhook" as const, label: "Webhook" },
    { value: "cron" as const, label: "Cron" },
    { value: "edge_function" as const, label: "Edge Function" },
    { value: "rpc" as const, label: "RPC" },
    { value: "trigger" as const, label: "Trigger" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">분류</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as ProductionInfraCategory | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {checks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          인프라 점검 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["분류", "대상", "상태", "차단 사유", "비고"]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-gray-100 ${
                c.blockerReason ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getInfraCategoryLabel(c.category)}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {c.targetName}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    c.status === "verified"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "missing"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getInfraStatusLabel(c.status)}
                </span>
              </td>
              <td className="max-w-[180px] px-3 py-2.5 text-[13px] text-red-700">
                {c.blockerReason ?? "-"}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {c.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
