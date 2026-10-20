"use client";

/**
 * 결제 수신 기록 `/admin/store-payment-events` — 결제사 자동 알림으로 들어온 기록 (조회 전용).
 * 목록 조건 = 주소 (`order_id`·`source`·`event_type`·`page`·`size`, R7 목록 표준 — 서버 페이지 + 총 건수).
 * `?order_id=` (주문 상세 → LNK-5) 는 URL 이 바뀔 때마다 그대로 조회 조건이 된다. 원시 값(source ·
 * event_type · payload · UUID)은 「기술 정보」에만 둔다. 주문 링크는 주문 상세(DEF-49).
 */
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { readAdminReturnToFromSearch, withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

type Row = {
  id: string;
  source: string;
  order_id: string | null;
  event_type: string;
  provider: string | null;
  transmission_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

/** Known values written by app/api/webhooks/store-order-payment (append-store-payment-event). */
const SOURCE_OPTIONS: readonly { value: string; key: MessageKey }[] = [{ value: "webhook_generic", key: "admin_r4b_pay_source_webhook" }];
const EVENT_OPTIONS: readonly { value: string; key: MessageKey }[] = [
  { value: "payment.succeeded", key: "admin_r4b_pay_event_succeeded" },
  { value: "payment.failed", key: "admin_r4b_pay_event_failed" },
];

function sourceKey(source: string): MessageKey {
  return SOURCE_OPTIONS.find((o) => o.value === source)?.key ?? "admin_r4b_pay_source_other";
}
function eventKey(eventType: string): MessageKey {
  return EVENT_OPTIONS.find((o) => o.value === eventType)?.key ?? "admin_r4b_pay_event_other";
}

const INPUT = "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-helper text-sam-fg";
const LIST_CONFIG = { extras: ["order_id", "source", "event_type"] as const };

export function AdminStorePaymentEventsPage() {
  return (
    <Suspense fallback={null}>
      <AdminStorePaymentEventsPageInner />
    </Suspense>
  );
}

function AdminStorePaymentEventsPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // URL is the filter state (deep links from order detail keep working on back/forward).
  const lq = useAdminListQuery(LIST_CONFIG);
  const orderId = lq.query.extras.order_id.trim();
  const source = lq.query.extras.source.trim();
  const eventType = lq.query.extras.event_type.trim();
  const returnTo = readAdminReturnToFromSearch(searchParams);

  const [draftOrderId, setDraftOrderId] = useState(orderId);
  useEffect(() => setDraftOrderId(orderId), [orderId]);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/store-payment-events?${lq.apiQueryString}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; events?: Row[]; total?: number } | null;
        if (!alive) return;
        if (!res.ok || !json?.ok) {
          // 실패해도 직전 목록은 지우지 않는다 (§8-5).
          setError({ code: res.status === 403 ? "forbidden" : json?.error || "load_failed", status: res.status });
          return;
        }
        setRows(json.events ?? []);
        setTotal(Number(json.total) || 0);
      })
      .catch(() => {
        if (!alive) return;
        setError({ code: "network_error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey = 같은 조건 다시 불러오기 포함 (order_id · source · event_type · page · size)
  }, [lq.refreshKey]);

  const errorCode = error?.code === "table_missing" ? null : error?.code;

  return (
    <div className="space-y-4" data-admin-payment-events="1">
      <AdminPageHeader titleKey="admin_menu_store_payment_events" description={t("admin_stores_payment_desc")} />

      {orderId ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted px-3 py-2 sam-text-helper text-sam-fg"
          data-payment-events-order-filter={orderId}
        >
          <span>{t("admin_r4b_pay_order_filter_active")}</span>
          <Link className="text-signature underline" href={returnTo ?? `/admin/stores/orders/${encodeURIComponent(orderId)}`}>
            {t("admin_r4b_pay_back_order")}
          </Link>
          <AdminActionButton variant="quiet" size="sm" onClick={() => lq.setExtra("order_id", "")}>
            {t("admin_r4b_pay_clear_order")}
          </AdminActionButton>
        </div>
      ) : null}

      <AdminFilterBar
        ko={ko}
        draft={{ q: draftOrderId, from: "", to: "" }}
        onDraftChange={(p) => {
          if (p.q !== undefined) setDraftOrderId(p.q);
        }}
        onSubmit={() => lq.setExtra("order_id", draftOrderId.trim())}
        onReset={() => {
          setDraftOrderId("");
          lq.reset();
        }}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={t("admin_r4b_pay_filter_order")}
      >
        <label className="flex flex-col gap-1 sam-text-xxs text-sam-muted">
          {t("admin_stores_payment_filter_source")}
          <select className={INPUT} value={source} onChange={(ev) => lq.setExtra("source", ev.target.value)}>
            <option value="">{t("admin_r4b_pay_filter_all")}</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sam-text-xxs text-sam-muted">
          {t("admin_stores_payment_filter_event")}
          <select className={INPUT} value={eventType} onChange={(ev) => lq.setExtra("event_type", ev.target.value)}>
            <option value="">{t("admin_r4b_pay_filter_all")}</option>
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.key)}
              </option>
            ))}
          </select>
        </label>
      </AdminFilterBar>

      {error ? (
        error.code === "table_missing" ? (
          <AdminEmptyState ko={ko} message={t("admin_stores_payment_err_table_missing")} />
        ) : (
          <AdminErrorState ko={ko} code={errorCode} httpStatus={error.status} onRetry={lq.refresh} />
        )
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        error ? null : (
          <AdminEmptyState
            ko={ko}
            message={lq.isFiltered ? undefined : t("admin_stores_payment_empty")}
            onReset={
              lq.isFiltered
                ? () => {
                    setDraftOrderId("");
                    lq.reset();
                  }
                : undefined
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface sam-text-helper">
          <table className="min-w-full text-left">
            <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2">{t("admin_stores_payment_th_time")}</th>
                <th className="px-2 py-2">{t("admin_r4b_pay_th_source")}</th>
                <th className="px-2 py-2">{t("admin_r4b_pay_th_event")}</th>
                <th className="px-2 py-2">{t("admin_r4b_pay_th_order")}</th>
                <th className="px-2 py-2">{t("admin_r4b_pay_th_provider")}</th>
                <th className="min-w-[72px] px-2 py-2">{t("admin_stores_payment_th_detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-sam-muted">{formatAdminManilaDateTime(r.created_at)}</td>
                  <td className="px-2 py-2 text-sam-fg">{t(sourceKey(r.source))}</td>
                  <td className="px-2 py-2 text-sam-fg">{t(eventKey(r.event_type))}</td>
                  <td className="px-2 py-2">
                    {r.order_id ? (
                      <Link
                        href={withAdminReturnTo(
                          `/admin/stores/orders/${encodeURIComponent(r.order_id)}`,
                          `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
                        )}
                        className="text-signature underline"
                      >
                        {t("admin_r4b_pay_open_order")}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-sam-fg">{r.provider ?? "—"}</td>
                  <td className="px-2 py-2">
                    <AdminTechDetails ko={ko}>
                      <div className="max-w-[min(100vw-2rem,42rem)] space-y-1">
                        <p>source {r.source}</p>
                        <p>event_type {r.event_type}</p>
                        {r.order_id ? <p>order_id {r.order_id}</p> : null}
                        {r.transmission_id ? <p>transmission_id {r.transmission_id}</p> : null}
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-ui-rect border border-sam-border bg-sam-app p-2 sam-text-xxs leading-relaxed">
                          {JSON.stringify(r.payload ?? {}, null, 2)}
                        </pre>
                      </div>
                    </AdminTechDetails>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      ) : null}
    </div>
  );
}
