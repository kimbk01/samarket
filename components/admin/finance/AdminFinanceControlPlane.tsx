"use client";

/**
 * ARO-OPS-UX-002-B4 — Common Finance Control Plane (read-only overview).
 * Action Required first; Point/Coin/Cash never merged.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  AdminControlPlaneEmpty,
  AdminControlPlaneSection,
} from "@/components/admin/ui/AdminControlPlaneChrome";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import type {
  FinanceActionItem,
  FinanceControlPlaneModel,
  FinanceSectionRow,
} from "@/lib/admin/finance-control-plane/types";
import {
  adminFinancePrimaryCta,
  adminOperatorLabel,
  adminStripTechnicalMeta,
} from "@/lib/admin/operator-ux/operator-labels";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translateBy } from "@/lib/i18n/translate-by";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AdminControlPlaneSection id={id} title={title} dataAttr="data-admin-finance-section">
      {children}
    </AdminControlPlaneSection>
  );
}

/** 조회 실패 소스 키 → 화면 이름 (서버는 키만 보낸다 · 원문 오류 노출 금지). */
const FINANCE_SECTION_LABELS: Record<string, { ko: string; en: string }> = {
  point: catalogPair("admin_point_charge_requests"),
  cash: catalogPair("admin_cash_charge_requests"),
  coin_withdraw: catalogPair("admin_coin_withdrawals"),
  payable: catalogPair("admin_settlement_payables"),
  obligation: catalogPair("admin_fee_obligations"),
  coin_ledger: catalogPair("admin_coin_ledger"),
  cash_ledger: catalogPair("admin_cash_ledger"),
};

function financeSectionLabel(key: string, ko: boolean): string {
  const section = key.split(":")[0] ?? "";
  const label = FINANCE_SECTION_LABELS[section];
  if (label) return ko ? label.ko : label.en;
  return translateBy(ko ? "ko" : "en", "admin_finance_other_source");
}

function Unavail({ ko }: { ko: boolean }) {
  return <AdminUnavailableChip ko={ko} />;
}

function RowTable({
  rows,
  ko,
  empty,
}: {
  rows: FinanceSectionRow[];
  ko: boolean;
  empty: string;
}) {
  const { t } = useI18n();
  if (rows.length === 0) {
    return (
      <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-4 text-center sam-text-body-secondary text-sam-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[42rem] text-left sam-text-body-secondary">
        <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
          <tr>
            <th className="px-3 py-2">{t("admin_finance_actor")}</th>
            <th className="px-3 py-2">{t("admin_finance_type")}</th>
            <th className="px-3 py-2">{t("admin_finance_amount")}</th>
            <th className="px-3 py-2">{t("admin_biz_label_status")}</th>
            <th className="px-3 py-2">{t("admin_finance_when")}</th>
            <th className="px-3 py-2">{t("admin_finance_action")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sam-border-soft">
          {rows.map((r) => {
            const meta = adminStripTechnicalMeta(r.meta, ko);
            return (
            <tr key={r.id}>
              <td className="truncate px-3 py-2 font-medium text-sam-fg">{r.label}</td>
              <td className="px-3 py-2">{adminOperatorLabel(r.type, ko)}</td>
              <td className="px-3 py-2 tabular-nums">{r.amountLabel}</td>
              <td className="px-3 py-2">{adminOperatorLabel(r.status, ko)}</td>
              <td className="whitespace-nowrap px-3 py-2 sam-text-xxs">
                {r.at ? formatAdminManilaDateTime(r.at) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <Link href={r.href} className="font-semibold text-signature hover:underline">
                    {t("admin_finance_review")}
                  </Link>
                  {r.statementHref ? (
                    <Link href={r.statementHref} className="text-signature hover:underline">
                      {t("admin_finance_finance_history")}
                    </Link>
                  ) : null}
                  {r.memberHref ? (
                    <Link href={r.memberHref} className="text-signature hover:underline">
                      {t("admin_finance_member")}
                    </Link>
                  ) : null}
                </div>
                {meta ? <p className="mt-0.5 sam-text-xxs text-sam-muted">{meta}</p> : null}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionCard({ item, ko }: { item: FinanceActionItem; ko: boolean }) {
  const { t } = useI18n();
  const badge =
    item.currency === "POINT" ? (
      <CurrencyBadge currency="point" />
    ) : item.currency === "COIN" ? (
      <CurrencyBadge currency="coin" />
    ) : item.currency === "CASH" ? (
      <CurrencyBadge currency="cash" />
    ) : (
      <span className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs">
        {t("admin_finance_php")}
      </span>
    );
  const ageLabel =
    item.ageHours == null
      ? ""
      : item.ageHours < 24
        ? t("admin_hours_h_ago", { hours: item.ageHours })
        : t("admin_days_d_ago", { days: Math.floor(item.ageHours / 24) });

  return (
    <div
      className="flex min-h-[8.5rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
      data-admin-finance-action={item.type}
      data-source={item.source}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          <span className="sam-text-xxs font-semibold text-sam-fg">
            {adminOperatorLabel(item.type, ko)}
          </span>
          {ageLabel ? <span className="sam-text-xxs text-sam-muted">{ageLabel}</span> : null}
        </div>
        <p className="text-[14px] font-semibold text-sam-fg">{item.actorLabel}</p>
        <p className="tabular-nums text-sam-fg">{item.amountLabel}</p>
        <p className="sam-text-helper text-sam-muted">{adminOperatorLabel(item.status, ko)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AdminActionLink href={item.href} variant="secondary">
          {adminFinancePrimaryCta(item.type, ko)}
        </AdminActionLink>
        {item.actorKind === "store" && item.statementHref ? (
          <AdminActionLink href={item.statementHref} variant="secondary">
            {t("admin_finance_store_finance")}
          </AdminActionLink>
        ) : null}
        {item.memberHref ? (
          <AdminActionLink href={item.memberHref} variant="secondary">
            {t("admin_finance_member")}
          </AdminActionLink>
        ) : null}
      </div>
    </div>
  );
}

export function AdminFinanceControlPlane() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<FinanceControlPlaneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminLoadFailure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance-control-plane", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        plane?: FinanceControlPlaneModel;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.plane) {
        setModel(null);
        setError({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setModel(json.plane);
    } catch {
      setModel(null);
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !model) {
    return (
      <div data-admin-finance-control-plane="loading">
        <AdminLoadingState ko={ko} />
      </div>
    );
  }

  if (error && !model) {
    return (
      <div data-admin-finance-control-plane="error">
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={() => void load()} />
      </div>
    );
  }

  if (!model) return null;
  const q = model.queues;

  return (
    <div className="space-y-5" data-admin-finance-control-plane="1" data-aro-ops-ux-002-b4="1">
      <header className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="sam-text-page-title font-semibold text-sam-fg">
              {t("admin_finance_finance")}
            </h1>
            <p className="mt-1 sam-text-body text-sam-muted">
              {t("admin_finance_review_requests_and_act_on_point")}
            </p>
          </div>
          <AdminActionButton variant="neutral" onClick={() => void load()}>
            {t("admin_finance_ops_queue_refresh")}
          </AdminActionButton>
        </div>
        {model.sectionErrors.length > 0 ? (
          <p className="sam-text-helper text-sam-warning">
            {t("admin_finance_some_sources_unavailable")}:{" "}
            {model.sectionErrors.map((key) => financeSectionLabel(key, ko)).join(" · ")}
          </p>
        ) : null}
      </header>

      <Section id="action-required" title={t("admin_finance_action_required")}>
        {model.actionRequired.length === 0 ? (
          <AdminControlPlaneEmpty
            message={
              t("admin_finance_no_finance_items_need_action_right")
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.actionRequired.map((item) => (
              <ActionCard key={item.id} item={item} ko={ko} />
            ))}
          </div>
        )}
      </Section>

      <Section id="current-state" title={t("admin_finance_current_financial_state_by_currency")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {model.currentState.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="min-h-[5.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
              data-admin-finance-state={m.id}
              data-source={m.source}
            >
              <p className="sam-text-helper text-sam-muted">{ko ? m.labelKo : m.labelEn}</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums text-sam-fg">
                {m.value == null ? <Unavail ko={ko} /> : m.value}
              </p>
              <p className="mt-1 sam-text-xxs text-sam-muted">{m.currencyNote}</p>
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 sam-text-body-secondary">
          {(
            [
              [t("admin_finance_point"), "point", q.point],
              [t("admin_finance_cash"), "cash", q.cash],
              [t("admin_finance_coin_withdraw"), "coin", q.coinWithdraw],
              [t("admin_finance_platform_payable"), "settlement", q.settlement],
              [t("admin_finance_fees"), "obligation", q.obligationStores],
            ] as const
          ).map(([label, k, s]) => (
            <Link key={k} href={s.href} className="text-signature hover:underline" data-admin-finance-ops={k}>
              {label}: {s.unavailable ? t("admin_finance_unavailable") : s.count ?? 0}
            </Link>
          ))}
        </div>
      </Section>

      <Section id="point" title={t("admin_finance_point_member")}>
        {model.point.unavailable ? (
          <Unavail ko={ko} />
        ) : (
          <RowTable
            rows={model.point.pendingRows}
            ko={ko}
            empty={t("admin_finance_no_pending_point_charges_0")}
          />
        )}
        <Link href={model.point.queueHref} className="inline-block sam-text-body font-semibold text-signature hover:underline">
          {t("admin_finance_open_point_charge_queue")}
        </Link>
      </Section>

      <Section id="coin" title={t("admin_finance_coin_store_earn_convert_withdraw")}>
        <h3 className="sam-text-helper font-semibold text-sam-muted">
          {t("admin_finance_sale_coin_earn_history_not_approval")}
        </h3>
        <RowTable
          rows={model.coin.recentCredits}
          ko={ko}
          empty={t("admin_finance_no_recent_sale_coin_credits")}
        />
        <h3 className="mt-3 sam-text-helper font-semibold text-sam-muted">
          {t("admin_finance_coin_cash_history_not_approval")}
        </h3>
        <RowTable
          rows={model.coin.recentConversions}
          ko={ko}
          empty={t("admin_finance_no_recent_conversions")}
        />
        {/* `#coin-withdrawals` — 처리 대기·대시보드·재무 큐 링크가 여는 위치 */}
        <h3 id="coin-withdrawals" className="mt-3 scroll-mt-16 sam-text-helper font-semibold text-sam-muted">
          {t("admin_finance_coin_withdrawal_requires_admin")}
        </h3>
        <RowTable
          rows={model.coin.withdrawRows}
          ko={ko}
          empty={t("admin_finance_0_open_withdrawals")}
        />
      </Section>

      <Section id="cash" title={t("admin_finance_cash_store")}>
        <h3 className="sam-text-helper font-semibold text-sam-muted">
          {t("admin_finance_top_up_pending")}
        </h3>
        <RowTable
          rows={model.cash.pendingTopUps}
          ko={ko}
          empty={t("admin_finance_0_cash_top_ups_pending")}
        />
        <h3 className="mt-3 sam-text-helper font-semibold text-sam-muted">
          {t("admin_finance_recent_cash_ledger")}
        </h3>
        <RowTable
          rows={model.cash.recentLedger}
          ko={ko}
          empty={t("admin_finance_no_recent_cash_events")}
        />
      </Section>

      <Section id="obligations" title={t("admin_finance_unpaid_sale_fee_option_b")}>
        <p className="sam-text-helper text-sam-muted">
          {t("admin_finance_obligations_summary", {
            stores: model.obligations.storeCount ?? "UNAVAILABLE",
            total:
              model.obligations.outstandingMinor == null
                ? "UNAVAILABLE"
                : cashMinorFmt(model.obligations.outstandingMinor),
          })}
        </p>
        <RowTable
          rows={model.obligations.rows}
          ko={ko}
          empty={model.obligations.unavailable ? "UNAVAILABLE" : t("admin_finance_0_unpaid")}
        />
      </Section>

      <Section id="settlements" title={t("admin_finance_platform_payable_gift_coupon_held")}>
        <p className="sam-text-helper text-sam-muted">
          {t("admin_finance_direct_pay_model_stores_collect_order")}
        </p>
        {!model.settlements.unavailable ? (
          <dl className="grid grid-cols-2 gap-2 sam-text-helper sm:grid-cols-4">
            <div>
              <dt className="text-sam-muted">{t("admin_finance_payable")}</dt>
              <dd className="font-semibold tabular-nums">{formatAdminPhp(model.settlements.payablePhp ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_orders")}</dt>
              <dd className="font-semibold tabular-nums">{formatAdminNumber(model.settlements.pendingCount ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_collected_by_stores_no_payout")}</dt>
              <dd className="tabular-nums">{formatAdminPhp(model.settlements.directCollectedPhp ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_legacy_snapshots_reference")}</dt>
              <dd className="tabular-nums">
                {formatAdminPhp(model.settlements.legacyOpenSettlementPhp ?? 0)} ·{" "}
                {formatAdminNumber(model.settlements.legacyOpenSettlementCount ?? 0)}
              </dd>
            </div>
          </dl>
        ) : null}
        <RowTable
          rows={model.settlements.rows}
          ko={ko}
          empty={
            model.settlements.unavailable
              ? "UNAVAILABLE"
              : t("admin_finance_0_payable_orders")
          }
        />
        <Link
          href={model.settlements.queueHref}
          className="inline-block sam-text-body font-semibold text-signature hover:underline"
        >
          {t("admin_finance_open_payable_detail")}
        </Link>
      </Section>

      <Section id="refunds" title={t("admin_finance_refunds_adjustments_typed")}>
        <RowTable
          rows={model.refunds.rows}
          ko={ko}
          empty={t("admin_finance_no_recent_refund_events")}
        />
      </Section>

      <Section id="recent" title={t("admin_finance_recent_financial_activity")}>
        <RowTable rows={model.recent} ko={ko} empty={t("admin_finance_no_recent_activity")} />
      </Section>

      <Section id="entries" title={t("admin_finance_quick_management")}>
        <ul className="flex flex-wrap gap-2">
          {model.primaryEntries.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                className="inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-surface"
                data-admin-finance-entry={e.id}
                data-frequency={e.frequency}
              >
                {ko ? e.labelKo : e.labelEn}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** R7-b — Cash(센타보) = 소수점 2자리 고정 (「₱22.5」 금지). */
function cashMinorFmt(minor: number): string {
  return formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true });
}
