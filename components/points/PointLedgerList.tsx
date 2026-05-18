"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointLedgerEntry, PointLedgerEntryType } from "@/lib/types/point";

const LEDGER_KEYS: Record<PointLedgerEntryType, MessageKey> = {
  charge: "point_ledger_charge",
  spend: "point_ledger_spend",
  refund: "point_ledger_refund",
  admin_adjust: "point_ledger_admin_adjust",
  expire: "point_ledger_expire",
  reward: "point_ledger_reward",
  reverse: "point_ledger_reverse",
  ad_purchase: "point_ledger_ad_purchase",
  ad_refund: "point_ledger_ad_refund",
};

interface PointLedgerListProps {
  entries: PointLedgerEntry[];
}

export function PointLedgerList({ entries }: PointLedgerListProps) {
  const { t } = useI18n();

  if (entries.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {t("points_ui_ledger_empty")}
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
              {t(LEDGER_KEYS[e.entryType])} {e.description}
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
              {t("points_ui_balance_after", { balance: e.balanceAfter.toLocaleString() })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
