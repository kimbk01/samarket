"use client";

import { useMemo } from "react";
import { getPointLedgerForAdmin } from "@/lib/points/mock-point-ledger";
import { POINT_LEDGER_ENTRY_LABELS } from "@/lib/points/point-utils";

export function AdminPointLedgerPage() {
  const entries = useMemo(() => getPointLedgerForAdmin(), []);

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-semibold text-gray-900">
        포인트 원장
      </h1>
      {entries.length === 0 ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          원장 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  사용자
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  유형
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  금액
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  잔액
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  설명
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  일시
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5">
                    {e.userNickname} ({e.userId})
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {POINT_LEDGER_ENTRY_LABELS[e.entryType]}
                  </td>
                  <td
                    className={`px-3 py-2.5 font-medium ${
                      e.amount > 0 ? "text-emerald-600" : "text-gray-700"
                    }`}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount}P
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {e.balanceAfter}P
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-600">
                    {e.description}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
