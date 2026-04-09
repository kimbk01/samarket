"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  getAdminSanctionLedgerFromDb,
  getActionTypeLabel,
  type AdminSanctionLedgerRow,
} from "@/lib/admin-reports/getAdminSanctionLedgerFromDb";

export function AdminSanctionLedgerPage() {
  const [rows, setRows] = useState<AdminSanctionLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSanctionLedgerFromDb(200)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="제재 원장" />
      <p className="text-[14px] text-gray-600">
        관리자가 신고에 대해 수행한 조치 로그입니다. (report_actions + reports)
      </p>
      {loading ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          기록이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">처리일시</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">조치</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">신고 ID</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">대상 유형</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">사유</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.action_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                    {new Date(r.action_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[13px] text-gray-700">
                      {getActionTypeLabel(r.action_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/reports/${r.report_id}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {r.report_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{r.target_type}</td>
                  <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                    {r.reason_code}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{r.report_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
