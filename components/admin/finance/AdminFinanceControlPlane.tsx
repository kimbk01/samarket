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
            <th className="px-3 py-2">{ko ? "대상" : "Actor"}</th>
            <th className="px-3 py-2">{ko ? "유형" : "Type"}</th>
            <th className="px-3 py-2">{ko ? "금액" : "Amount"}</th>
            <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
            <th className="px-3 py-2">{ko ? "시각" : "When"}</th>
            <th className="px-3 py-2">{ko ? "조치" : "Action"}</th>
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
                {r.at ? new Date(r.at).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <Link href={r.href} className="font-semibold text-signature hover:underline">
                    {ko ? "검토하기" : "Review"}
                  </Link>
                  {r.statementHref ? (
                    <Link href={r.statementHref} className="text-signature hover:underline">
                      {ko ? "재무 내역" : "Finance history"}
                    </Link>
                  ) : null}
                  {r.memberHref ? (
                    <Link href={r.memberHref} className="text-signature hover:underline">
                      {ko ? "회원 정보" : "Member"}
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
  const badge =
    item.currency === "POINT" ? (
      <CurrencyBadge currency="point" />
    ) : item.currency === "COIN" ? (
      <CurrencyBadge currency="coin" />
    ) : item.currency === "CASH" ? (
      <CurrencyBadge currency="cash" />
    ) : (
      <span className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs">
        {ko ? "정산(PHP)" : "PHP"}
      </span>
    );
  const ageLabel =
    item.ageHours == null
      ? ""
      : item.ageHours < 24
        ? ko
          ? `${item.ageHours}시간 전`
          : `${item.ageHours}h ago`
        : ko
          ? `${Math.floor(item.ageHours / 24)}일 전`
          : `${Math.floor(item.ageHours / 24)}d ago`;

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
        <p className="text-[15px] font-semibold text-sam-fg">{item.actorLabel}</p>
        <p className="tabular-nums text-sam-fg">{item.amountLabel}</p>
        <p className="sam-text-helper text-sam-muted">{adminOperatorLabel(item.status, ko)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AdminActionLink href={item.href} variant="primary">
          {adminFinancePrimaryCta(item.type, ko)}
        </AdminActionLink>
        {item.actorKind === "store" && item.statementHref ? (
          <AdminActionLink href={item.statementHref} variant="secondary">
            {ko ? "매장 재무" : "Store finance"}
          </AdminActionLink>
        ) : null}
        {item.memberHref ? (
          <AdminActionLink href={item.memberHref} variant="secondary">
            {ko ? "회원 정보" : "Member"}
          </AdminActionLink>
        ) : null}
      </div>
    </div>
  );
}

export function AdminFinanceControlPlane() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<FinanceControlPlaneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/finance-control-plane", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plane?: FinanceControlPlaneModel;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.plane) {
        setModel(null);
        setError(json.error || "load_failed");
        return;
      }
      setModel(json.plane);
    } catch {
      setModel(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !model) {
    return (
      <p className="sam-text-body text-sam-muted" data-admin-finance-control-plane="loading">
        {ko ? "재무 관제 화면을 불러오는 중…" : "Loading finance control plane…"}
      </p>
    );
  }

  if (error && !model) {
    return (
      <p
        className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        data-admin-finance-control-plane="error"
      >
        {ko ? "재무 관제를 불러오지 못했습니다." : "Could not load finance control plane."} ({error})
      </p>
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
              {ko ? "재무" : "Finance"}
            </h1>
            <p className="mt-1 sam-text-body text-sam-muted">
              {ko
                ? "지금 처리할 요청을 확인하고, 회원·매장별로 Point / Coin / Cash / 정산을 조치합니다. 자산은 합산하지 않습니다."
                : "Review requests and act on Point / Coin / Cash / settlements per member or store. Assets are never merged."}
            </p>
          </div>
          <AdminActionButton variant="neutral" onClick={() => void load()}>
            {ko ? "새로고침" : "Refresh"}
          </AdminActionButton>
        </div>
        {model.sectionErrors.length > 0 ? (
          <p className="sam-text-helper text-amber-800">
            {ko ? "일부 소스 확인 불가" : "Some sources unavailable"}: {model.sectionErrors.join(" · ")}
          </p>
        ) : null}
      </header>

      <Section id="action-required" title={ko ? "지금 처리할 돈" : "Action required"}>
        {model.actionRequired.length === 0 ? (
          <AdminControlPlaneEmpty
            message={
              ko ? "지금 처리할 재무 항목이 없습니다." : "No finance items need action right now."
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

      <Section id="current-state" title={ko ? "현재 재무 상태 (통화별)" : "Current financial state (by currency)"}>
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
              <p className="mt-1 text-2xl font-semibold tabular-nums text-sam-fg">
                {m.value == null ? <Unavail ko={ko} /> : m.value}
              </p>
              <p className="mt-1 sam-text-xxs text-sam-muted">{m.currencyNote}</p>
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 sam-text-body-secondary">
          {(
            [
              [ko ? "Point 충전" : "Point", "point", q.point],
              [ko ? "Cash 충전" : "Cash", "cash", q.cash],
              [ko ? "Coin 출금" : "Coin withdraw", "coin", q.coinWithdraw],
              [ko ? "정산" : "Settlement", "settlement", q.settlement],
              [ko ? "미납 수수료" : "Fees", "obligation", q.obligationStores],
            ] as const
          ).map(([label, k, s]) => (
            <Link key={k} href={s.href} className="text-signature hover:underline" data-admin-finance-ops={k}>
              {label}: {s.unavailable ? (ko ? "확인 불가" : "UNAVAILABLE") : s.count ?? 0}
            </Link>
          ))}
        </div>
      </Section>

      <Section id="point" title={ko ? "Point (회원)" : "Point (member)"}>
        {model.point.unavailable ? (
          <Unavail ko={ko} />
        ) : (
          <RowTable
            rows={model.point.pendingRows}
            ko={ko}
            empty={ko ? "대기 Point 충전 없음 (0건)" : "No pending Point charges (0)"}
          />
        )}
        <Link href={model.point.queueHref} className="inline-block sam-text-body font-semibold text-signature hover:underline">
          {ko ? "Point 충전 큐 열기" : "Open Point charge queue"}
        </Link>
      </Section>

      <Section id="coin" title={ko ? "Coin (매장)" : "Coin (store)"}>
        <h3 className="sam-text-helper font-semibold text-sam-muted">
          {ko ? "출금 요청" : "Withdrawals"}
        </h3>
        <RowTable
          rows={model.coin.withdrawRows}
          ko={ko}
          empty={ko ? "출금 대기 0건" : "0 open withdrawals"}
        />
        <h3 className="mt-3 sam-text-helper font-semibold text-sam-muted">
          {ko ? "최근 판매 적립" : "Recent sale credits"}
        </h3>
        <RowTable
          rows={model.coin.recentCredits}
          ko={ko}
          empty={ko ? "최근 판매 Coin 없음" : "No recent sale Coin credits"}
        />
        <h3 className="mt-3 sam-text-helper font-semibold text-sam-muted">Coin → Cash</h3>
        <RowTable
          rows={model.coin.recentConversions}
          ko={ko}
          empty={ko ? "최근 전환 없음" : "No recent conversions"}
        />
      </Section>

      <Section id="cash" title={ko ? "Cash (매장)" : "Cash (store)"}>
        <h3 className="sam-text-helper font-semibold text-sam-muted">
          {ko ? "충전 대기" : "Top-up pending"}
        </h3>
        <RowTable
          rows={model.cash.pendingTopUps}
          ko={ko}
          empty={ko ? "Cash 충전 대기 0건" : "0 Cash top-ups pending"}
        />
        <h3 className="mt-3 sam-text-helper font-semibold text-sam-muted">
          {ko ? "최근 Cash 원장" : "Recent Cash ledger"}
        </h3>
        <RowTable
          rows={model.cash.recentLedger}
          ko={ko}
          empty={ko ? "최근 Cash 이벤트 없음" : "No recent Cash events"}
        />
      </Section>

      <Section id="obligations" title={ko ? "미납 판매수수료 (Option B)" : "Unpaid sale fee (Option B)"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? `미납 매장 ${model.obligations.storeCount ?? "UNAVAILABLE"} · 합계 ${
                model.obligations.outstandingMinor == null
                  ? "UNAVAILABLE"
                  : cashMinorFmt(model.obligations.outstandingMinor)
              }`
            : `Stores ${model.obligations.storeCount ?? "UNAVAILABLE"} · outstanding ${
                model.obligations.outstandingMinor == null
                  ? "UNAVAILABLE"
                  : cashMinorFmt(model.obligations.outstandingMinor)
              }`}
        </p>
        <RowTable
          rows={model.obligations.rows}
          ko={ko}
          empty={model.obligations.unavailable ? "UNAVAILABLE" : ko ? "미납 0건" : "0 unpaid"}
        />
      </Section>

      <Section id="settlements" title={ko ? "정산" : "Settlement"}>
        <RowTable
          rows={model.settlements.rows}
          ko={ko}
          empty={
            model.settlements.unavailable
              ? "UNAVAILABLE"
              : ko
                ? "검토 대상 정산 0건"
                : "0 settlements to review"
          }
        />
        <Link
          href={model.settlements.queueHref}
          className="inline-block sam-text-body font-semibold text-signature hover:underline"
        >
          {ko ? "정산 큐 열기" : "Open settlement queue"}
        </Link>
      </Section>

      <Section id="refunds" title={ko ? "환불 / 조정 (유형 구분)" : "Refunds / adjustments (typed)"}>
        <RowTable
          rows={model.refunds.rows}
          ko={ko}
          empty={ko ? "최근 환불 이벤트 없음" : "No recent refund events"}
        />
      </Section>

      <Section id="recent" title={ko ? "최근 재무 활동" : "Recent financial activity"}>
        <RowTable rows={model.recent} ko={ko} empty={ko ? "최근 활동 없음" : "No recent activity"} />
      </Section>

      <Section id="entries" title={ko ? "빠른 관리" : "Quick management"}>
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

function cashMinorFmt(minor: number): string {
  return `₱${(Math.trunc(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
