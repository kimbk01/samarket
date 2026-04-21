"use client";

import type { PointLedgerEntry } from "@/lib/types/point";
import { POINT_LEDGER_ENTRY_LABELS } from "@/lib/points/point-utils";

interface PointExpireListProps {
  /** 만료 예정 항목 (expiresAt 미래, !isExpired) */
  expiringEntries: PointLedgerEntry[];
  /** 만료된 내역 (isExpired 또는 entryType === expire) */
  expiredEntries?: PointLedgerEntry[];
  emptyMessage?: string;
}

export function PointExpireList({
  expiringEntries,
  expiredEntries = [],
  emptyMessage = "만료 예정/만료된 포인트가 없습니다.",
}: PointExpireListProps) {
  const hasExpiring = expiringEntries.length > 0;
  const hasExpired = expiredEntries.length > 0;

  if (!hasExpiring && !hasExpired) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasExpiring && (
        <section>
          <h3 className="mb-2 sam-text-body font-semibold text-sam-fg">
            만료 예정
          </h3>
          <ul className="space-y-2">
            {expiringEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-ui-rect border border-amber-100 bg-amber-50/50 py-3 px-3 sam-text-body"
              >
                <div>
                  <p className="font-medium text-sam-fg">
                    {POINT_LEDGER_ENTRY_LABELS[e.entryType]} {e.description}
                  </p>
                  <p className="sam-text-helper text-amber-700">
                    만료일:{" "}
                    {e.expiresAt
                      ? new Date(e.expiresAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </p>
                </div>
                <span className="font-semibold text-amber-800">
                  +{e.amount}P
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {hasExpired && (
        <section>
          <h3 className="mb-2 sam-text-body font-semibold text-sam-fg">
            만료 내역
          </h3>
          <ul className="space-y-2">
            {expiredEntries.map((e) => (
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
                <span className="font-semibold text-sam-muted">
                  {e.amount > 0 ? "+" : ""}
                  {e.amount}P
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
