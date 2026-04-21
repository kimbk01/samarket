"use client";

import { useMemo } from "react";
import { getPointLedgerForAdmin } from "@/lib/points/mock-point-ledger";
import { POINT_LEDGER_ENTRY_LABELS } from "@/lib/points/point-utils";

export function AdminPointLedgerPage() {
  const entries = useMemo(() => getPointLedgerForAdmin(), []);

  return (
    <div className="space-y-4">
      <h1 className="sam-text-page-title font-semibold text-sam-fg">
        포인트 원장
      </h1>
      {entries.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          원장 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  사용자
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  유형
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  금액
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  잔액
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  설명
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5">
                    {e.userNickname} ({e.userId})
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {POINT_LEDGER_ENTRY_LABELS[e.entryType]}
                  </td>
                  <td
                    className={`px-3 py-2.5 font-medium ${
                      e.amount > 0 ? "text-emerald-600" : "text-sam-fg"
                    }`}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount}P
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {e.balanceAfter}P
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-muted">
                    {e.description}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
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
