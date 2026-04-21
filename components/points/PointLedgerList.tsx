"use client";

import type { PointLedgerEntry } from "@/lib/types/point";
import { POINT_LEDGER_ENTRY_LABELS } from "@/lib/points/point-utils";

interface PointLedgerListProps {
  entries: PointLedgerEntry[];
}

export function PointLedgerList({ entries }: PointLedgerListProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        포인트 거래내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between border-b border-sam-border-soft py-3 sam-text-body"
        >
          <div>
            <p className="font-medium text-sam-fg">
              {POINT_LEDGER_ENTRY_LABELS[e.entryType]} {e.description}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {new Date(e.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="text-right">
            <p
              className={
                e.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-sam-fg"
              }
            >
              {e.amount > 0 ? "+" : ""}
              {e.amount.toLocaleString()}P
            </p>
            <p className="sam-text-helper text-sam-muted">
              잔액 {e.balanceAfter.toLocaleString()}P
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
