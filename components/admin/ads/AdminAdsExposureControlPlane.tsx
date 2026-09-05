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
  return (
    <div
      className="flex min-h-[9rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
      data-admin-ads-action={item.domain}
      data-entity={item.entity}
      data-source={item.source}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CurrencyChip currency={item.currency} />
          <span className="sam-text-xxs uppercase text-sam-muted">{item.domain}</span>
          <span className="sam-text-xxs text-sam-muted">{item.product}</span>
        </div>
        <p className="text-[15px] font-semibold text-sam-fg">{item.applicantLabel}</p>
        <p className="sam-text-helper text-sam-muted">
          {item.status}
          {item.placementHint ? ` · ${item.placementHint}` : ""}
        </p>
        {item.eligibility ? (
          <p className="sam-text-xxs text-amber-900">{item.eligibility}</p>
        ) : null}
        {item.creativeHint ? (
          <p className="truncate sam-text-xxs text-sam-muted">creative: {item.creativeHint}</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AdminActionLink href={item.href} variant="primary">
          {ko ? "광고 신청 검토" : "Review application"}
        </AdminActionLink>
        {item.statementHref ? (
          <AdminActionLink href={item.statementHref} variant="secondary">
            Statement
          </AdminActionLink>
        ) : null}
        {item.financeHref ? (
          <AdminActionLink href={item.financeHref} variant="secondary">
            Finance
          </AdminActionLink>
        ) : null}
        {item.memberHref ? (
          <AdminActionLink href={item.memberHref} variant="secondary">
            Member
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
      <table className="w-full min-w-[48rem] text-left sam-text-body-secondary">
        <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
          <tr>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">{ko ? "상품" : "Product"}</th>
            <th className="px-3 py-2">{ko ? "집행" : "Execution"}</th>
            <th className="px-3 py-2">Placement</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Eligibility</th>
            <th className="px-3 py-2">Links</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sam-border-soft">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.domain}</td>
              <td className="px-3 py-2">{r.product}</td>
              <td className="truncate px-3 py-2 font-medium">{r.label}</td>
              <td className="px-3 py-2">{r.placement || "—"}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 sam-text-xxs">{r.eligibility}</td>
              <td className="px-3 py-2">
                <Link href={r.href} className="font-semibold text-signature hover:underline">
                  {ko ? "상세" : "Open"}
                </Link>
                {r.statementHref ? (
                  <>
                    {" · "}
                    <Link href={r.statementHref} className="text-signature hover:underline">
                      Statement
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
              {ko ? "광고 / 노출 관제" : "Ads / Exposure Control Plane"}
            </h1>
            <p className="mt-1 sam-text-body text-sam-muted">
              {ko
                ? "신청 → 소재 → 비용(currency) → 승인 → 집행 → 실제 노출 가능 여부. Delivery/Feed/Popup authority는 합치지 않습니다."
                : "Application → creative → billing currency → approval → execution → exposure eligibility. Domains stay separate."}
            </p>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {ko
                ? "엔티티: 광고 상품 · 광고 신청 · 광고 소재 · 노출 위치 · 광고 집행 · 노출 정책 · 비용 (합치지 않음)"
                : "Entities: Ad product · Application · Creative · Placement · Execution · Policy · Billing (kept separate)"}
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

      <Section id="work-queues" title={ko ? "운영 큐 (분리)" : "Work queues (separated)"}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={q.delivery.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            APPLICATION REVIEW
          </Link>
          <a
            href="#creatives"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            CREATIVE REVIEW
          </a>
          <a
            href="#execution"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            SCHEDULE / EXECUTION
          </a>
          <Link
            href="/admin/delivery-ads?view=ended"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
          >
            ENDED / HISTORY
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 sam-text-body-secondary">
          {(
            [
              ["delivery", q.delivery],
              ["feed", q.feed],
              ["popup", q.popup],
              ["trade_promote", q.tradePromote],
            ] as const
          ).map(([k, s]) => (
            <Link key={k} href={s.href} className="text-signature hover:underline" data-admin-ads-queue={k}>
              {k}: {s.unavailable ? <Unavail ko={ko} /> : (s.count ?? 0)}
            </Link>
          ))}
        </div>
      </Section>

      <Section id="execution" title={ko ? "현재 집행 상태" : "Current execution state"}>
        <ExecTable rows={model.currentExecution} ko={ko} />
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

      <Section id="creatives" title={ko ? "소재 검수 / Preview" : "Creative review / Preview"}>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "미리보기는 상세·Placement Map의 실제 placement preview renderer를 사용합니다. 이미지 파일명만 보여주지 않습니다."
            : "Preview uses the real placement preview renderer on detail / Placement Map — not filename-only."}
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
          {ko ? "Placement Map · 실제 지면/aspect" : "Placement Map · surfaces/aspect"}
        </Link>
      </Section>

      <Section id="placement-map" title={ko ? "노출 위치 (Placement ≠ Banner)" : "Placement map (≠ Banner)"}>
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[40rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Placement</th>
                <th className="px-3 py-2">{ko ? "상품" : "Product"}</th>
                <th className="px-3 py-2">Aspect</th>
                <th className="px-3 py-2">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {model.placements.slice(0, 24).map((p) => (
                <tr key={`${p.domain}:${p.placementId}`}>
                  <td className="px-3 py-2">{p.domain}</td>
                  <td className="px-3 py-2">{ko ? p.displayNameKo : p.displayNameEn}</td>
                  <td className="px-3 py-2">{p.productKind}</td>
                  <td className="px-3 py-2">{p.aspectRatio}</td>
                  <td className="px-3 py-2">
                    <Link href={p.href} className="text-signature hover:underline">
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="billing" title={ko ? "비용 / 환불 context" : "Billing / refund context"}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {model.billingNotes.map((b) => (
            <li
              key={b.domain}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              data-admin-ads-billing={b.domain}
            >
              <div className="flex items-center gap-2">
                <CurrencyChip currency={b.currency} />
                <span className="font-semibold text-sam-fg">{b.domain}</span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">{ko ? b.noteKo : b.noteEn}</p>
              <Link href={b.href} className="sam-text-helper font-semibold text-signature hover:underline">
                {ko ? "연결 열기" : "Open"}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="entries" title={ko ? "도메인 / 전문 진입" : "Domain entries"}>
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
            ? "Partner·쿠폰·Gift·organic ranking은 광고 상품이 아닙니다."
            : "Partner, coupons, gifts, and organic ranking are not AdProducts."}
        </p>
      </Section>

      <Section id="recent" title={ko ? "최근 활동" : "Recent activity"}>
        {model.recent.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{ko ? "최근 항목 없음" : "No recent rows"}</p>
        ) : (
          <ul className="space-y-1 sam-text-body-secondary">
            {model.recent.slice(0, 12).map((r) => (
              <li key={`recent-${r.id}`} className="flex flex-wrap gap-2 border-b border-sam-border-soft py-1.5">
                <span className="text-sam-muted">{r.domain}</span>
                <span className="font-medium">{r.applicantLabel}</span>
                <span className="text-sam-muted">{r.status}</span>
                <Link href={r.href} className="text-signature hover:underline">
                  {ko ? "열기" : "Open"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
