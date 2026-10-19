"use client";

/**
 * 매장 허브 요약 카드 (§3 공통 연결표 · DEF-56).
 * 탭마다 같은 링크 카드 대신 실제 요약 + 대상 화면 딥링크(store_id 필터 + returnTo).
 * 데이터: GET /api/admin/stores/[id]/hub-summary (읽기 전용). 쓰기는 각 공통 화면 API.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { mapAuditAction } from "@/lib/admin-business/store-audit-action-labels";
import type { StoreHubAuditEntry, StoreHubSummary } from "@/lib/admin-business/store-hub-summary-types";
import type { BusinessCcKpiSummary, BusinessCcOpsOverview } from "@/lib/admin-business/load-business-control-center-detail";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  businessCcAdvertisingHref,
  businessCcAuditHref,
  businessCcCashChargesHref,
  businessCcCashTransactionsHref,
  businessCcInquiriesHref,
  businessCcOwnerMemberHref,
  businessCcPointsHref,
  businessCcSettlementsHref,
} from "@/lib/admin-business/business-control-center-links";

export type StoreHubSummaryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; summary: StoreHubSummary };

/** 요약 1회 로드 + refreshKey 변경 시 재조회. */
export function useStoreHubSummary(storeId: string, refreshKey: number): StoreHubSummaryState {
  const [state, setState] = useState<StoreHubSummaryState>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}/hub-summary`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; summary?: StoreHubSummary } | null;
      if (!res.ok || !j?.ok || !j.summary) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", summary: j.summary });
    } catch {
      setState({ status: "error" });
    }
  }, [storeId]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  return state;
}

const cardClass = "rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm";
const linkClass =
  "inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cardClass} data-admin-hub-card={title}>
      <h3 className="sam-text-helper font-semibold text-sam-fg">{title}</h3>
      <div className="mt-2 space-y-1.5 sam-text-body-secondary text-sam-fg">{children}</div>
    </section>
  );
}

function Links({ items }: { items: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {items.map((l) => (
        <Link key={`${l.href}:${l.label}`} href={l.href} className={linkClass}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export function actorDisplay(
  e: Pick<StoreHubAuditEntry, "actorType" | "actorLabel">,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (e.actorType === "system") return t("admin_r4a_actor_system");
  if (e.actorType === "user") {
    return e.actorLabel ? `${t("admin_r4a_actor_owner")} · ${e.actorLabel}` : t("admin_r4a_actor_owner");
  }
  return e.actorLabel ? `${t("admin_r4a_actor_admin")} · ${e.actorLabel}` : t("admin_r4a_actor_unknown_admin");
}

export type StoreHubSection = "overview" | "products" | "orders" | "points" | "settlement" | "reviews";

export function AdminStoreHubSummaryCards({
  storeId,
  ownerUserId,
  returnTo,
  section,
  state,
  ops,
  kpi,
}: {
  storeId: string;
  ownerUserId: string;
  /** 현재 매장 허브 URL — 공통 화면에서 돌아오기 */
  returnTo: string;
  section: StoreHubSection;
  state: StoreHubSummaryState;
  ops: BusinessCcOpsOverview;
  kpi: BusinessCcKpiSummary;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const rt = (href: string) => withAdminReturnTo(href, returnTo);
  const na = t("admin_r4a_hub_unavailable");
  const s = state.status === "ready" ? state.summary : null;

  const ownerCard = (
    <Card key="owner" title={t("admin_r4a_hub_owner_title")}>
      {s?.owner ? (
        <>
          <p className="flex items-center gap-2">
            <span className="text-sam-muted">{t("admin_r4a_hub_owner_status")}</span>
            {s.owner.status ? (
              (() => {
                const st = adminStatusLabel("member", s.owner.status, ko);
                return <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>;
              })()
            ) : (
              <span>{na}</span>
            )}
          </p>
          <p className="text-sam-muted">
            {s.owner.sanctionCount == null ? na : t("admin_r4a_hub_owner_sanctions", { n: String(s.owner.sanctionCount) })}
          </p>
          {s.owner.lastSanction ? (
            <p className="text-sam-muted">
              {t("admin_r4a_hub_owner_last_sanction", {
                action: sanctionLabel(s.owner.lastSanction.action, ko),
                at: formatAdminDateTime(s.owner.lastSanction.createdAt, language),
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sam-muted">{state.status === "loading" ? t("common_loading") : na}</p>
      )}
      {ownerUserId ? (
        <Links items={[{ href: rt(businessCcOwnerMemberHref(ownerUserId)), label: t("admin_r4a_hub_owner_open") }]} />
      ) : null}
    </Card>
  );

  const adsCard = (
    <Card key="ads" title={t("admin_r4a_hub_ads_title")}>
      <p>
        {s?.ads
          ? t("admin_r4a_hub_ads_counts", { active: String(s.ads.active), pending: String(s.ads.pending) })
          : state.status === "loading"
            ? t("common_loading")
            : na}
      </p>
      <Links items={[{ href: rt(businessCcAdvertisingHref(storeId)), label: t("admin_r4a_hub_ads_open") }]} />
    </Card>
  );

  const cashCard = (
    <Card key="cash" title={t("admin_r4a_hub_cash_title")}>
      <p>
        <span className="text-sam-muted">{t("admin_r4a_hub_cash_balance")} </span>
        {s?.cash?.balanceMinor != null ? formatDeliveryAdPhpMinor(s.cash.balanceMinor) : state.status === "loading" ? "…" : na}
      </p>
      <p>
        <span className="text-sam-muted">{t("admin_r4a_hub_coin_balance")} </span>
        {s?.coin?.balance != null ? s.coin.balance.toLocaleString("en-PH") : ops.pointBalance != null ? ops.pointBalance.toLocaleString("en-PH") : na}
      </p>
      {s?.cash?.pendingCharges != null ? (
        <p className={s.cash.pendingCharges > 0 ? "font-semibold text-amber-800" : "text-sam-muted"}>
          {t("admin_r4a_hub_cash_pending", { n: String(s.cash.pendingCharges) })}
        </p>
      ) : null}
      <Links
        items={[
          { href: rt(businessCcCashTransactionsHref(storeId)), label: t("admin_r4a_hub_cash_tx") },
          { href: rt(businessCcPointsHref(storeId)), label: t("admin_r4a_hub_coin_tx") },
          {
            href: rt(`${businessCcCashChargesHref()}?store_id=${encodeURIComponent(storeId)}`),
            label: t("admin_r4a_hub_cash_charges"),
          },
        ]}
      />
    </Card>
  );

  const feeCard = (
    <Card key="fee" title={t("admin_r4a_hub_fee_title")}>
      {s?.commission ? (
        <>
          <p>
            <span className="text-sam-muted">{t("admin_r4a_hub_fee_month")} </span>
            {formatDeliveryAdPhpMinor(s.commission.monthFeeDueMinor)}
          </p>
          <p className={s.commission.outstandingCount > 0 ? "font-semibold text-red-700" : "text-sam-muted"}>
            {t("admin_r4a_hub_fee_outstanding", {
              n: String(s.commission.outstandingCount),
              amount: formatDeliveryAdPhpMinor(s.commission.outstandingMinor),
            })}
          </p>
          <p className={s.commission.reviewRequired > 0 ? "font-semibold text-amber-800" : "text-sam-muted"}>
            {t("admin_r4a_hub_fee_review", { n: String(s.commission.reviewRequired) })}
          </p>
        </>
      ) : (
        <p className="text-sam-muted">{state.status === "loading" ? t("common_loading") : na}</p>
      )}
      <Links items={[{ href: rt(businessCcSettlementsHref(storeId)), label: t("admin_r4a_hub_fee_open") }]} />
    </Card>
  );

  const inquiryCard = (
    <Card key="inquiry" title={t("admin_r4a_hub_inquiry_title")}>
      <p className={s?.inquiries && s.inquiries.open > 0 ? "font-semibold text-amber-800" : undefined}>
        {s?.inquiries
          ? t("admin_r4a_hub_inquiry_counts", { open: String(s.inquiries.open), total: String(s.inquiries.total) })
          : state.status === "loading"
            ? t("common_loading")
            : na}
      </p>
      <Links items={[{ href: rt(businessCcInquiriesHref(storeId)), label: t("admin_r4a_hub_inquiry_open") }]} />
    </Card>
  );

  const auditCard = (
    <Card key="audit" title={t("admin_r4a_hub_audit_title")}>
      {s?.recentAudit ? (
        s.recentAudit.length === 0 ? (
          <p className="text-sam-muted">{t("admin_r4a_hub_audit_empty")}</p>
        ) : (
          <ul className="space-y-1" data-admin-hub-recent-audit="1">
            {s.recentAudit.map((e) => (
              <li key={e.id} className="border-b border-sam-border-soft pb-1 last:border-0">
                <span className="font-medium">{mapAuditAction(e.action, ko)}</span>
                <span className="ml-1 text-sam-muted">· {actorDisplay(e, t)}</span>
                <span className="ml-1 text-sam-meta">· {formatAdminDateTime(e.createdAt, language)}</span>
                {e.reason ? <p className="text-sam-muted">{e.reason}</p> : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="text-sam-muted">{state.status === "loading" ? t("common_loading") : na}</p>
      )}
      <Links items={[{ href: rt(businessCcAuditHref(storeId)), label: t("admin_r4a_hub_audit_all") }]} />
    </Card>
  );

  const productsCard = (
    <Card key="products" title={t("admin_r4a_hub_products_title")}>
      <p>
        {t("admin_r4a_hub_products_counts", {
          active: String(ops.productActiveCount),
          soldOut: String(ops.productSoldOutCount),
          inactive: String(ops.productInactiveCount),
        })}
      </p>
    </Card>
  );

  const ordersCard = (
    <Card key="orders" title={t("admin_r4a_hub_orders_title")}>
      <p>
        {t("admin_r4a_hub_orders_counts", {
          inProgress: String(kpi.orderStatusCounts.inProgress),
          pending: String(kpi.orderStatusCounts.pending),
          cancelled: String(kpi.orderStatusCounts.cancelled),
          refund: String(kpi.orderStatusCounts.refundRequested),
        })}
      </p>
    </Card>
  );

  const reviewsCard = (
    <Card key="reviews" title={t("admin_r4a_hub_reviews_title")}>
      <p>
        {t("admin_r4a_hub_reviews_counts", {
          total: String(kpi.reviewCount),
          hidden: String(kpi.hiddenReviewCount),
        })}
      </p>
    </Card>
  );

  const cards =
    section === "products"
      ? [productsCard]
      : section === "orders"
        ? [ordersCard, inquiryCard]
        : section === "points"
          ? [cashCard, adsCard]
          : section === "settlement"
            ? [feeCard, cashCard]
            : section === "reviews"
              ? [reviewsCard]
              : [ownerCard, adsCard, cashCard, feeCard, inquiryCard, auditCard];

  return (
    <div className="space-y-2" data-admin-store-hub-summary={section}>
      {section === "overview" ? (
        <div>
          <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_r4a_hub_summary_title")}</h2>
          <p className="sam-text-helper text-sam-muted">{t("admin_r4a_hub_summary_hint")}</p>
        </div>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
          {t("admin_r4a_hub_summary_load_failed")}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{cards}</div>
    </div>
  );
}

function sanctionLabel(action: string, ko: boolean): string {
  const map: Record<string, [string, string]> = {
    warn: ["경고", "Warning"],
    suspend: ["이용 정지", "Suspension"],
    ban: ["이용 차단", "Ban"],
  };
  const hit = map[action];
  return hit ? (ko ? hit[0] : hit[1]) : ko ? "제재" : "Sanction";
}

type HubReportRow = {
  id: string;
  status: string;
  reason_type: string;
  message: string;
  target_type: string;
  product_title: string | null;
  created_at: string;
};

/** DEF-13 — 매장 허브 「신고」 탭: 이 매장 신고 최근 5건 (상태 라벨) + 신고 화면 링크는 호출부. */
export function AdminStoreHubRecentReports({ storeId, refreshKey }: { storeId: string; refreshKey: number }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<HubReportRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void fetch(`/api/admin/store-reports?store_id=${encodeURIComponent(storeId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as { ok?: boolean; reports?: HubReportRow[] } | null;
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          setFailed(true);
          setRows(null);
          return;
        }
        setRows((j.reports ?? []).slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, refreshKey]);

  return (
    <div className="space-y-1.5" data-admin-hub-recent-reports="1">
      <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_r4a_hub_reports_recent")}</p>
      {failed ? (
        <p role="alert" className="sam-text-helper text-red-800">{t("admin_r4a_hub_summary_load_failed")}</p>
      ) : rows == null ? (
        <p className="sam-text-helper text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{t("admin_r4a_hub_reports_empty")}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const st = adminStatusLabel("report", r.status, ko);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-1 sam-text-body-secondary last:border-0">
                <AdminToneBadge tone={st.tone}>{st.label}</AdminToneBadge>
                <span className="min-w-0 flex-1 truncate text-sam-fg">
                  {r.target_type === "product" && r.product_title ? `${r.product_title} · ` : ""}
                  {r.message}
                </span>
                <span className="text-sam-meta">{formatAdminDateTime(r.created_at, language)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
