"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointLedgerEntry, PointLedgerEntryType } from "@/lib/types/point";

const LEDGER_KEYS: Record<PointLedgerEntryType, MessageKey> = {
  charge: "point_ledger_charge",
  spend: "point_ledger_spend",
  refund: "point_ledger_refund",
  admin_adjust: "point_ledger_admin_adjust",
  admin_credit: "point_ledger_admin_credit",
  admin_debit: "point_ledger_admin_debit",
  expire: "point_ledger_expire",
  reward: "point_ledger_reward",
  reverse: "point_ledger_reverse",
  ad_purchase: "point_ledger_ad_purchase",
  ad_refund: "point_ledger_ad_refund",
  ad_hold: "point_ledger_ad_hold",
  ad_hold_release: "point_ledger_ad_hold_release",
  ad_charge: "point_ledger_ad_charge",
};

interface PointExpireListProps {
  expiringEntries: PointLedgerEntry[];
  expiredEntries?: PointLedgerEntry[];
  emptyMessage?: string;
}

export function PointExpireList({
  expiringEntries,
  expiredEntries = [],
  emptyMessage,
}: PointExpireListProps) {
  const { t } = useI18n();
  const empty = emptyMessage ?? t("points_ui_expire_empty");
  const hasExpiring = expiringEntries.length > 0;
  const hasExpired = expiredEntries.length > 0;

  if (!hasExpiring && !hasExpired) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasExpiring && (
        <section>
          <h3 className="mb-2 sam-text-body font-semibold text-sam-fg">
            {t("points_ui_expiring_section")}
          </h3>
          <ul className="space-y-2">
            {expiringEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-ui-rect border border-amber-100 bg-amber-50/50 py-3 px-3 sam-text-body"
              >
                <div>
                  <p className="font-medium text-sam-fg">
                    {t(LEDGER_KEYS[e.entryType])} {e.description}
                  </p>
                  <p className="sam-text-helper text-amber-700">
                    {t("points_ui_expire_date")}{" "}
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
            {t("points_ui_expired_section")}
          </h3>
          <ul className="space-y-2">
            {expiredEntries.map((e) => (
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
