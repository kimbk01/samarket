"use client";

/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane (cross-domain read-only).
 * Delivery / Feed / Popup authorities stay separate. No "campaign" as UI term.
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
  AdsActionItem,
  AdsControlPlaneModel,
  AdsExecutionRow,
} from "@/lib/admin/ads-control-plane/types";
import {
  adminDisplayApplicantLabel,
  adminOperatorLabel,
} from "@/lib/admin/operator-ux/operator-labels";

function Unavail({ ko }: { ko: boolean }) {
  return <AdminUnavailableChip ko={ko} />;
}

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
    <AdminControlPlaneSection id={id} title={title} dataAttr="data-admin-ads-section">
      {children}
    </AdminControlPlaneSection>
  );
}

function CurrencyChip({ currency }: { currency: AdsActionItem["currency"] }) {
  if (currency === "POINT") return <CurrencyBadge currency="point" />;
  if (currency === "CASH") return <CurrencyBadge currency="cash" />;
  return <span className="sam-text-xxs text-sam-muted">{currency}</span>;
}

function ActionCard({ item, ko }: { item: AdsActionItem; ko: boolean }) {
  const title = adminDisplayApplicantLabel(item.applicantLabel, ko);
  const creativeIsUrl =
    !!item.creativeHint &&
    (/^https?:\/\//i.test(item.creativeHint) || item.creativeHint.includes("supabase"));
  return (
    <div
      className="flex min-h-[9rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
      data-admin-ads-action={item.domain}
      data-entity={item.entity}
      data-source={item.source}
      data-admin-control="ads-action-card"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CurrencyChip currency={item.currency} />
          <span className="sam-text-xxs text-sam-muted">
            {adminOperatorLabel(item.domain, ko)}
          </span>
          <span className="sam-text-xxs text-sam-muted">
            {adminOperatorLabel(item.product, ko)}
          </span>
          <span className="rounded-ui-rect bg-sam-app px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-fg">
            {item.status}
          </span>
        </div>
        <p className="text-[15px] font-semibold text-sam-fg">{title}</p>
        {item.placementHint ? (
          <p className="sam-text-helper text-sam-muted">
            {ko ? "노출" : "Placement"}: {adminOperatorLabel(item.placementHint, ko)}
          </p>
        ) : null}
        <p className="sam-text-helper text-sam-fg">
          {[item.paymentLabel, item.periodLabel, item.remainingLabel, item.exposureLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.whyActionable ? (
          <p className="sam-text-xxs text-amber-900">{item.whyActionable}</p>
        ) : null}
        {item.creativeHint && !creativeIsUrl ? (
          <p className="truncate sam-text-xxs text-sam-muted">
            {ko ? "소재" : "Creative"}: {item.creativeHint}
          </p>
        ) : creativeIsUrl ? (
          <p className="sam-text-xxs text-sam-muted">
            {ko ? "소재 이미지 있음 (상세에서 확인)" : "Creative image attached (see detail)"}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AdminActionLink href={item.href} variant="primary">
          {ko ? "검토하기" : "Review"}
        </AdminActionLink>
        {item.financeHref ? (
          <AdminActionLink href={item.financeHref} variant="secondary">
            {ko ? "재무" : "Finance"}
          </AdminActionLink>
        ) : item.statementHref ? (
          <AdminActionLink href={item.statementHref} variant="secondary">
            {ko ? "매장 재무" : "Store finance"}
          </AdminActionLink>
        ) : null}
      </div>
    </div>
  );
}

function ExecTable({ rows, ko }: { rows: AdsExecutionRow[]; ko: boolean }) {
  if (!rows.length) {
    return (
      <p className="rounded-ui-rect border border-dashed border-sam-border px-3 py-4 text-center sam-text-body-secondary text-sam-muted">
        {ko ? "현재 집행/예약/중지 행 없음 (0)" : "No active/scheduled/paused rows (0)"}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[52rem] text-left sam-text-body-secondary">
        <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
          <tr>
            <th className="px-3 py-2">{ko ? "영역" : "Domain"}</th>
            <th className="px-3 py-2">{ko ? "상품" : "Product"}</th>
            <th className="px-3 py-2">{ko ? "매장/집행" : "Store"}</th>
            <th className="px-3 py-2">{ko ? "노출 위치" : "Placement"}</th>
            <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
            <th className="px-3 py-2">{ko ? "기간·남은" : "Period"}</th>
            <th className="px-3 py-2">{ko ? "노출" : "Exposure"}</th>
            <th className="px-3 py-2">{ko ? "충돌" : "Conflict"}</th>
            <th className="px-3 py-2">{ko ? "조치" : "Action"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sam-border-soft">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{adminOperatorLabel(r.domain, ko)}</td>
              <td className="px-3 py-2">{adminOperatorLabel(r.product, ko)}</td>
              <td className="truncate px-3 py-2 font-medium">
                {adminDisplayApplicantLabel(r.label, ko)}
              </td>
              <td className="px-3 py-2">
                {r.placement ? adminOperatorLabel(r.placement, ko) : "—"}
              </td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 sam-text-xxs">
                {[r.period, r.remainingLabel].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-3 py-2 sam-text-xxs">{r.eligibility || "—"}</td>
              <td className="px-3 py-2 sam-text-xxs">
                <span
                  className={
                    r.conflictSeverity === "BLOCKING"
                      ? "font-semibold text-red-800"
                      : r.conflictSeverity === "WARNING"
                        ? "font-semibold text-amber-900"
                        : "text-sam-muted"
                  }
                >
                  {ko ? r.conflictLabelKo : r.conflictLabelEn}
                </span>
              </td>
              <td className="px-3 py-2">
                <Link href={r.href} className="font-semibold text-signature hover:underline">
                  {ko ? "검토하기" : "Review"}
                </Link>
                {r.statementHref ? (
                  <>
                    {" · "}
                    <Link href={r.statementHref} className="text-signature hover:underline">
                      {ko ? "매장 재무" : "Finance"}
                    </Link>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAdsExposureControlPlane() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ads-control-plane", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plane?: AdsControlPlaneModel;
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
      <p className="sam-text-body text-sam-muted" data-admin-ads-control-plane="loading">
        {ko ? "광고/노출 관제를 불러오는 중…" : "Loading ads/exposure control plane…"}
      </p>
    );
  }

  if (error && !model) {
    return (
      <p
        className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        data-admin-ads-control-plane="error"
      >
        {ko ? "광고/노출 관제를 불러오지 못했습니다." : "Could not load ads control plane."} ({error})
      </p>
    );
  }

  if (!model) return null;
  const q = model.queues;

  return (
    <div className="space-y-5" data-admin-ads-control-plane="1" data-aro-ops-ux-002-b5="1">
      <header className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="sam-text-page-title font-semibold text-sam-fg">
              {ko ? "광고 / 노출" : "Ads / Exposure"}
            </h1>
            <p className="mt-1 sam-text-body text-sam-muted">
              {ko
                ? "신청 검토 → 소재 확인 → 비용·승인 → 집행. 배달·피드·팝업은 각각 따로 처리합니다."
                : "Review applications → creatives → billing & approval → execution. Delivery, feed, and popup stay separate."}
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

      <Section id="action-required" title={ko ? "지금 처리할 광고" : "Action required"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "심사·소재·결제·일정 문제가 있는 신청만 모읍니다. 승인·결제·실제 노출은 각각 별개입니다."
            : "Only applications needing review, creative, payment, or schedule. Approval, payment, and exposure stay separate."}
        </p>
        {model.actionRequired.length === 0 ? (
          <AdminControlPlaneEmpty
            message={ko ? "지금 처리할 광고 항목이 없습니다." : "No ads items need action right now."}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.actionRequired.map((item) => (
              <ActionCard key={item.id} item={item} ko={ko} />
            ))}
          </div>
        )}
      </Section>

      <Section id="work-queues" title={ko ? "운영 큐" : "Work queues"}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Link
            href={q.delivery.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            {ko ? "신청 검토" : "Application review"}
            <span className="mt-1 block tabular-nums text-sam-muted">
              {q.delivery.unavailable ? (ko ? "확인 불가" : "Unavailable") : (q.delivery.count ?? "—")}
            </span>
          </Link>
          <a
            href="#collision"
            className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-3 sam-text-body-secondary font-semibold text-red-950 hover:bg-red-100"
            data-admin-ads-queue="collision_blocking"
          >
            {ko ? "노출 충돌" : "Exposure collision"}
            <span className="mt-1 block tabular-nums">
              {q.collisionBlocking.unavailable
                ? ko
                  ? "확인 불가"
                  : "Unavailable"
                : (q.collisionBlocking.count ?? "—")}
            </span>
          </a>
          <a
            href="#collision"
            className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary font-semibold text-amber-950 hover:bg-amber-100"
            data-admin-ads-queue="collision_warning"
          >
            {ko ? "중복 확인 필요" : "Duplication review"}
            <span className="mt-1 block tabular-nums">
              {q.collisionWarning.unavailable
                ? ko
                  ? "확인 불가"
                  : "Unavailable"
                : (q.collisionWarning.count ?? "—")}
            </span>
          </a>
          <Link
            href={q.endingSoon.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
            data-admin-ads-queue="ending_soon"
          >
            {ko ? "종료 예정" : "Ending soon"}
            <span className="mt-1 block tabular-nums text-sam-muted">
              {q.endingSoon.unavailable
                ? ko
                  ? "확인 불가"
                  : "Unavailable"
                : (q.endingSoon.count ?? "—")}
            </span>
          </Link>
          <Link
            href={q.vacantSlots?.href ?? "#occupancy"}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
            data-admin-ads-queue="vacant_slots"
          >
            {ko ? "빈 자리" : "Vacancy"}
            <span className="mt-1 block tabular-nums text-sam-muted">
              {q.vacantSlots?.unavailable ? (ko ? "확인 불가" : "Unavailable") : (q.vacantSlots?.count ?? 0)}
            </span>
          </Link>
          <a
            href="#execution"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            {ko ? "일정·집행" : "Schedule / execution"}
          </a>
        </div>
        <div className="flex flex-wrap gap-3 sam-text-body-secondary">
          {(
            [
              [ko ? "배달" : "Delivery", "delivery", q.delivery],
              [ko ? "피드" : "Feed", "feed", q.feed],
              [ko ? "팝업" : "Popup", "popup", q.popup],
              [ko ? "거래 홍보" : "Trade", "trade_promote", q.tradePromote],
            ] as const
          ).map(([label, k, s]) => (
            <Link key={k} href={s.href} className="text-signature hover:underline" data-admin-ads-queue={k}>
              {label}: {s.unavailable ? <Unavail ko={ko} /> : (s.count ?? 0)}
            </Link>
          ))}
        </div>
      </Section>

      <Section id="collision" title={ko ? "노출 충돌 / 중복" : "Overlap / collision"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "기존 inventory·일정·lifecycle으로 계산합니다. 허용 가능한 중복과 실제 충돌을 구분합니다."
            : "Computed from inventory, schedule, and lifecycle. Allowed duplication vs real collision."}
        </p>
        {(model.collisions ?? []).length === 0 ? (
          <AdminControlPlaneEmpty
            message={ko ? "현재 충돌/중복 확인 항목이 없습니다." : "No overlap/collision items."}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(model.collisions ?? []).map((c) => (
              <div
                key={c.id}
                className={`flex min-h-[9rem] flex-col justify-between rounded-ui-rect border px-4 py-3 ${
                  c.severity === "BLOCKING"
                    ? "border-red-300 bg-red-50"
                    : "border-amber-300 bg-amber-50"
                }`}
                data-admin-ads-collision={c.severity}
              >
                <div className="space-y-1">
                  <p className="text-[13px] font-bold">
                    {ko ? c.severityLabelKo : c.severityLabelEn}
                  </p>
                  <p className="sam-text-helper text-sam-muted">
                    {c.domain} · {adminOperatorLabel(c.product, ko)}
                  </p>
                  <p className="text-[15px] font-semibold text-sam-fg">{c.storeName}</p>
                  <p className="sam-text-body-secondary">{c.placementLabel}</p>
                  <p className="sam-text-xxs text-sam-muted">{c.periodLabel ?? "—"}</p>
                  <p className="sam-text-helper">
                    {ko ? `겹치는 광고: ${c.peerCount}건` : `Overlapping: ${c.peerCount}`}
                  </p>
                  <p className="sam-text-xxs text-sam-muted">{ko ? c.reasonKo : c.reasonEn}</p>
                </div>
                <div className="mt-3">
                  <AdminActionLink href={c.href} variant="primary">
                    {ko ? "충돌 확인" : "Review collision"}
                  </AdminActionLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="execution" title={ko ? "현재 집행 상태" : "Current execution state"}>
        <ExecTable rows={model.currentExecution} ko={ko} />
      </Section>

      <Section id="occupancy" title={ko ? "지면 빈 자리 / 점유" : "Placement vacancy / occupancy"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "기존 일정·재고로 계산합니다. 확인 불가면 빈 자리 0으로 표시하지 않습니다."
            : "Computed from existing schedules. Unavailable never shows as vacancy 0."}
        </p>
        {q.vacantSlots?.unavailable ? (
          <p className="sam-text-body-secondary text-amber-900" data-admin-ads-occupancy="unavailable">
            {ko ? "점유 정보를 불러올 수 없습니다. 승인 전 충돌·빈 자리를 수동 확인하세요." : "Occupancy unavailable. Do not approve blindly."}
          </p>
        ) : (model.occupancy ?? []).length === 0 ? (
          <AdminControlPlaneEmpty
            message={ko ? "점유 계산 대상 지면이 없습니다." : "No occupancy rows."}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-admin-ads-occupancy="ok">
            {(model.occupancy ?? []).slice(0, 18).map((o) => (
              <Link
                key={o.placementKey}
                href={o.href}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 hover:bg-sam-app"
              >
                <p className="font-semibold text-sam-fg">
                  {ko ? o.displayNameKo : o.displayNameEn}
                </p>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">
                  {ko ? "사용" : "Used"} {o.liveCount}/{o.capacity}
                  {" · "}
                  {ko ? "빈 자리" : "Vacant"} {o.vacant}
                  {" · "}
                  {ko ? o.vacancyLabelKo : o.vacancyLabelEn}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section id="applications" title={ko ? "광고 신청" : "Applications"}>
        {model.applications.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {ko ? "신청 대기 0건" : "0 application rows"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.applications.slice(0, 12).map((a) => (
              <ActionCard key={`app-${a.id}`} item={a} ko={ko} />
            ))}
          </div>
        )}
      </Section>

      <Section id="creatives" title={ko ? "소재 검수" : "Creative review"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "상세 화면에서 노출 예시로 소재를 확인합니다."
            : "Review creatives via exposure preview on the detail screen."}
        </p>
        {model.creatives.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {ko ? "소재 제작/검수 대기 0건" : "0 creative review items"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.creatives.map((c) => (
              <ActionCard key={c.id} item={c} ko={ko} />
            ))}
          </div>
        )}
        <Link
          href="/admin/delivery-ads/inventory#placement-map"
          className="inline-flex sam-text-helper font-semibold text-signature hover:underline"
        >
          {ko ? "노출 위치 지도 열기" : "Open placement map"}
        </Link>
      </Section>

      <Section id="placement-map" title={ko ? "노출 위치" : "Placements"}>
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[40rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "영역" : "Domain"}</th>
                <th className="px-3 py-2">{ko ? "노출 위치" : "Placement"}</th>
                <th className="px-3 py-2">{ko ? "상품" : "Product"}</th>
                <th className="px-3 py-2">{ko ? "비율" : "Aspect"}</th>
                <th className="px-3 py-2">{ko ? "열기" : "Open"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {model.placements.slice(0, 24).map((p) => (
                <tr key={`${p.domain}:${p.placementId}`}>
                  <td className="px-3 py-2">{adminOperatorLabel(p.domain, ko)}</td>
                  <td className="px-3 py-2">{ko ? p.displayNameKo : p.displayNameEn}</td>
                  <td className="px-3 py-2">{adminOperatorLabel(p.productKind, ko)}</td>
                  <td className="px-3 py-2">{p.aspectRatio}</td>
                  <td className="px-3 py-2">
                    <Link href={p.href} className="text-signature hover:underline">
                      {ko ? "열기" : "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="billing" title={ko ? "비용 / 환불" : "Billing / refunds"}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {model.billingNotes.map((b) => (
            <li
              key={b.domain}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              data-admin-ads-billing={b.domain}
            >
              <div className="flex items-center gap-2">
                <CurrencyChip currency={b.currency} />
                <span className="font-semibold text-sam-fg">{adminOperatorLabel(b.domain, ko)}</span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">{ko ? b.noteKo : b.noteEn}</p>
              <Link href={b.href} className="sam-text-helper font-semibold text-signature hover:underline">
                {ko ? "연결 열기" : "Open"}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="entries" title={ko ? "빠른 관리" : "Quick management"}>
        <ul className="flex flex-wrap gap-2">
          {model.domainEntries.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                className="inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-surface"
                data-admin-ads-entry={e.id}
                data-frequency={e.frequency}
              >
                {ko ? e.labelKo : e.labelEn}
              </Link>
            </li>
          ))}
        </ul>
        <p className="sam-text-xxs text-sam-muted">
          {ko
            ? "Partner·쿠폰·Gift·일반 노출 순위는 광고 상품이 아닙니다."
            : "Partner, coupons, gifts, and organic ranking are not ad products."}
        </p>
      </Section>

      <Section id="recent" title={ko ? "최근 활동" : "Recent activity"}>
        {model.recent.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{ko ? "최근 항목 없음" : "No recent rows"}</p>
        ) : (
          <ul className="space-y-1 sam-text-body-secondary">
            {model.recent.slice(0, 12).map((r) => (
              <li key={`recent-${r.id}`} className="flex flex-wrap gap-2 border-b border-sam-border-soft py-1.5">
                <span className="text-sam-muted">{adminOperatorLabel(r.domain, ko)}</span>
                <span className="font-medium">{adminDisplayApplicantLabel(r.applicantLabel, ko)}</span>
                <span className="text-sam-muted">{adminOperatorLabel(r.status, ko)}</span>
                <Link href={r.href} className="text-signature hover:underline">
                  {ko ? "검토하기" : "Review"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
