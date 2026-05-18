import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "components/admin/delivery-orders");
const el = "motion.div".replace("motion.", "");

function w(name, content) {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
  console.log("wrote", name);
}

function addI18nImport(content) {
  if (content.includes("useI18n")) return content;
  return content.replace(
    '"use client";\n',
    '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n'
  );
}

function migrateSimpleClient(name, patches) {
  let c = addI18nImport(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const [from, to] of patches) c = c.split(from).join(to);
  const hook = "  const { t } = useI18n();\n";
  if (!c.includes("const { t } = useI18n()")) {
    c = c.replace(/export function (\w+)\([^)]*\) \{\n/, (m) => m + hook);
  }
  w(name, c);
}

w(
  "DeliveryAuditLogTable.tsx",
  `"use client";

import Link from "next/link";
import type { OrderStatusLog } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

export function DeliveryAuditLogTable({
  logs,
  orderNoById,
}: {
  logs: OrderStatusLog[];
  orderNoById: Record<string, string>;
}) {
  const { t, language } = useI18n();
  const locale = doAdminLocale(language);

  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (sorted.length === 0) {
    return <p className="py-6 text-center text-sm text-sam-muted">{t("admin_do_common_no_logs")}</p>;
  }
  return (
    <${el} className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[960px] border-collapse sam-text-helper">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            <th className="px-2 py-2">{t("admin_do_th_time")}</th>
            <th className="px-2 py-2">{t("admin_do_common_order")}</th>
            <th className="px-2 py-2">{t("admin_do_th_actor")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
            <th className="px-2 py-2">{t("admin_do_th_order_status")}</th>
            <th className="px-2 py-2">{t("admin_do_th_payment")}</th>
            <th className="px-2 py-2">{t("admin_do_th_settlement")}</th>
            <th className="px-2 py-2">{t("admin_do_th_reason")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="border-b border-sam-border-soft hover:bg-sam-app/60">
              <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                {new Date(l.createdAt).toLocaleString(locale)}
              </td>
              <td className="px-2 py-2">
                <Link
                  href={\`/admin/stores/orders/\${encodeURIComponent(l.orderId)}\`}
                  className="font-mono text-signature underline"
                >
                  {orderNoById[l.orderId] ?? l.orderId}
                </Link>
              </td>
              <td className="px-2 py-2">
                {l.actorType}
                <span className="text-sam-meta"> · </span>
                {l.actorId}
              </td>
              <td className="px-2 py-2 font-medium">{l.action}</td>
              <td className="px-2 py-2 text-sam-fg">
                {l.fromOrderStatus ?? "—"} → {l.toOrderStatus ?? "—"}
              </td>
              <td className="px-2 py-2 text-sam-muted">
                {l.fromPaymentStatus ?? "—"} → {l.toPaymentStatus ?? "—"}
              </td>
              <td className="px-2 py-2 text-sam-muted">
                {l.fromSettlementStatus ?? "—"} → {l.toSettlementStatus ?? "—"}
              </td>
              <td className="px-2 py-2 max-w-[240px] truncate text-sam-muted">{l.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </${el}>
  );
}
`
);

w(
  "DeliveryOrdersKpiCards.tsx",
  fs
    .readFileSync(path.join(dir, "DeliveryOrdersKpiCards.tsx"), "utf8")
    .replace(
      `import { formatMoneyPhp } from "@/lib/utils/format";`,
      `import { formatMoneyPhp } from "@/lib/utils/format";\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";`
    )
    .replace(
      `export function DeliveryOrdersKpiCards({ orders }: { orders: AdminDeliveryOrder[] }) {`,
      `export function DeliveryOrdersKpiCards({ orders }: { orders: AdminDeliveryOrder[] }) {\n  const { t } = useI18n();`
    )
    .replace(`{card("오늘 주문", data.todayCount)}`, `{card(t("admin_do_kpi_today_orders"), data.todayCount)}`)
    .replace(`{card("오늘 완료", data.completedToday)}`, `{card(t("admin_do_kpi_today_completed"), data.completedToday)}`)
    .replace(`{card("오늘 취소", data.cancelledToday)}`, `{card(t("admin_do_kpi_today_cancelled"), data.cancelledToday)}`)
    .replace(`{card("오늘 환불요청", data.refundReqToday)}`, `{card(t("admin_do_kpi_today_refund_req"), data.refundReqToday)}`)
    .replace(`{card("진행중 주문", data.inProgress)}`, `{card(t("admin_do_kpi_in_progress"), data.inProgress)}`)
    .replace(
      `{card("오늘 결제합(유료)", formatMoneyPhp(data.paidSumToday))}`,
      `{card(t("admin_do_kpi_paid_sum_today"), formatMoneyPhp(data.paidSumToday))}`
    )
    .replace(
      `{card("정산 예정(합계)", formatMoneyPhp(data.schedAmt))}`,
      `{card(t("admin_do_kpi_settlement_scheduled"), formatMoneyPhp(data.schedAmt))}`
    )
    .replace(
      `{card("정산 보류(합계)", formatMoneyPhp(data.heldAmt))}`,
      `{card(t("admin_do_kpi_settlement_held"), formatMoneyPhp(data.heldAmt))}`
    )
    .replace(`<p className="text-xs font-semibold text-sam-fg">매장별 주문 Top 5</p>`, `<p className="text-xs font-semibold text-sam-fg">{t("admin_do_kpi_store_top5")}</p>`)
    .replace(`<li className="text-sam-muted">표시할 주문이 없습니다.</li>`, `<li className="text-sam-muted">{t("admin_do_kpi_no_orders")}</li>`)
    .replace(
      `{i + 1}. {name} — {n}건`,
      `{t("admin_do_kpi_store_rank", { rank: i + 1, name, count: n })}`
    )
);

w(
  "DeliveryOrdersProgressPanel.tsx",
  fs
    .readFileSync(path.join(dir, "DeliveryOrdersProgressPanel.tsx"), "utf8")
    .replace(
      `import { ORDER_STATUS_LABEL } from "@/lib/admin/delivery-orders-admin/labels";`,
      `import { ORDER_STATUS_LABEL } from "@/lib/admin/delivery-orders-admin/labels";\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";`
    )
    .replace(
      `}) {\n  const stats = useMemo`,
      `}) {\n  const { t } = useI18n();\n  const stats = useMemo`
    )
    .replace(`<h2 className="text-sm font-semibold text-sam-fg">배달·포장 진행 현황</h2>`, `<h2 className="text-sm font-semibold text-sam-fg">{t("admin_do_progress_title")}</h2>`)
    .replace(
      `<p className="sam-text-xxs text-sam-muted">불러온 실주문 기준 · 칩을 누르면 아래 목록 필터가 맞춰집니다</p>`,
      `<p className="sam-text-xxs text-sam-muted">{t("admin_do_progress_hint")}</p>`
    )
    .replace(`chip(\n          "전체",`, `chip(\n          t("admin_do_progress_all"),`)
    .replace(`chip(\n          "진행 중",`, `chip(\n          t("admin_do_progress_active"),`)
    .replace(`chip(\n          "취소·환불",`, `chip(\n          t("admin_do_progress_cancel_refund"),`)
);

const clientPatches = [
  ['title="취소 주문"', "titleKey=\"admin_do_cancellations_title\""],
  ['title="취소 완료 (원장 · 최근 최대 500건)"', "titleKey=\"admin_do_cancellations_card\""],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
  [
    `DB 스키마상 취소 단계는{" "}
        <code className="rounded bg-sam-app px-1 sam-text-helper">cancelled</code> 로 확정된 건만 조회합니다. 추가
        처리는{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        과 주문 상세에서 진행하세요.`,
    `{t("admin_do_cancellations_intro")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>`,
  ],
];

migrateSimpleClient("DeliveryCancellationsClient.tsx", clientPatches);

migrateSimpleClient("DeliveryOrdersByStoreClient.tsx", [
  ["title={`매장 주문 이력 · ${title}`}", "title={t(\"admin_do_by_store_title\", { title })}"],
  ['title="주문 목록 (store_orders 원장 · 최대 500건)"', 'titleKey="admin_do_orders_list_card"'],
  ['매장 심사', '{t("admin_do_by_store_review")}'],
  ['매장 주문(액션)', '{t("admin_do_nav_store_orders")}'],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
]);

migrateSimpleClient("DeliveryOrdersByBuyerClient.tsx", [
  ["title={`회원 주문 이력 · ${label}`}", "title={t(\"admin_do_by_buyer_title\", { label })}"],
  ['title="주문 목록 (store_orders 원장 · 최대 500건)"', 'titleKey="admin_do_orders_list_card"'],
  ['메신저 검색', '{t("admin_do_by_buyer_messenger")}'],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
]);

migrateSimpleClient("DeliveryRefundsClient.tsx", [
  ['title="환불 요청"', 'titleKey="admin_do_refunds_title"'],
  ['title="대기 목록 (원장)"', 'titleKey="admin_do_refunds_card"'],
  [
    `"환불을 승인할까요? 주문이 refunded로 바뀌고 재고가 복구되며 예정 정산이 취소될 수 있습니다."`,
    `t("admin_do_refunds_confirm")`,
  ],
  ['show(json.error ?? "승인 실패");', 'show(json.error ?? t("admin_do_refunds_approve_failed"));'],
  ['show("환불 승인을 반영했습니다.");', 'show(t("admin_do_refunds_approve_ok"));'],
  ['show("네트워크 오류");', 'show(t("admin_do_refunds_network_error"));'],
  [
    `<code className="rounded bg-sam-app px-1 sam-text-helper">order_status = refund_requested</code> 원장만
        표시합니다. 승인은 DB API로 처리하고, 거절·기타 조정은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 이어가세요.`,
    `{t("admin_do_refunds_intro")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>`,
  ],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
]);

migrateSimpleClient("DeliveryReportsClient.tsx", [
  ['title="신고·분쟁"', 'titleKey="admin_do_reports_title"'],
  ['title="신고 목록"', 'titleKey="admin_do_reports_card"'],
  ['? "store_reports 테이블을 확인하세요."', '? t("admin_do_reports_table_missing")'],
  [
    `<code className="rounded bg-sam-app px-1 sam-text-helper">store_reports</code> 실데이터입니다. 상태 변경·메모·기각은{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          매장·상품 신고
        </Link>{" "}
        콘솔에서 처리하세요.`,
    `{t("admin_do_reports_intro")}{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          {t("admin_do_reports_console")}
        </Link>{" "}
        {t("admin_do_reports_console_suffix")}`,
  ],
  ['<p className="text-sm text-sam-muted">신고가 없습니다.</p>', '<p className="text-sm text-sam-muted">{t("admin_do_reports_empty")}</p>'],
  ['<th className="px-2 py-2">신고 ID</th>', '<th className="px-2 py-2">{t("admin_do_th_report_id_short")}</th>'],
  ['<th className="px-2 py-2">매장</th>', '<th className="px-2 py-2">{t("admin_do_th_store")}</th>'],
  ['<th className="px-2 py-2">대상</th>', '<th className="px-2 py-2">{t("admin_do_th_target")}</th>'],
  ['<th className="px-2 py-2">사유</th>', '<th className="px-2 py-2">{t("admin_do_th_reason")}</th>'],
  ['<th className="px-2 py-2">상태</th>', '<th className="px-2 py-2">{t("admin_do_th_status")}</th>'],
  ['<th className="px-2 py-2">접수</th>', '<th className="px-2 py-2">{t("admin_do_th_received")}</th>'],
  ['<span className="mt-0.5 block text-sam-muted">상품: {r.product_title}</span>', '<span className="mt-0.5 block text-sam-muted">{t("admin_do_reports_product", { title: r.product_title })}</span>'],
  ['.toLocaleString("ko-KR")', '.toLocaleString(doAdminLocale(language))'],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
]);

// DeliveryReportsClient needs doAdminLocale import
let reports = fs.readFileSync(path.join(dir, "DeliveryReportsClient.tsx"), "utf8");
if (!reports.includes("doAdminLocale")) {
  reports = reports.replace(
    'import { useI18n } from "@/components/i18n/AppLanguageProvider";',
    'import { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport { doAdminLocale } from "./do-admin-locale";'
  );
  reports = reports.replace("const { t } = useI18n();", "const { t, language } = useI18n();");
}
w("DeliveryReportsClient.tsx", reports);

migrateSimpleClient("DeliverySettlementsClient.tsx", [
  ['title="정산 관리"', 'titleKey="admin_do_settlements_title"'],
  ['title="정산 행 (주문 단위 · 최대 500건)"', 'titleKey="admin_do_settlements_card"'],
  [
    `주문 단위 정산 스냅샷은 원장 매핑 기준이며, 실제 지급·보류는{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          매장 정산
        </Link>
        과 동일 DB를 참고하세요. 환불·목록 액션은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 처리합니다.`,
    `{t("admin_do_settlements_intro")}{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          {t("admin_do_settlements_store_link")}
        </Link>
        {t("admin_do_settlements_intro_mid")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>`,
  ],
  ['목록을 불러오지 못했습니다 ({error}).', '{t("admin_do_settlements_list_failed", { error })}'],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
]);

migrateSimpleClient("DeliveryAuditLogsClient.tsx", [
  ['title="주문 감사 로그"', 'titleKey="admin_do_audit_title"'],
  ['title="주문 상태 변경 감사 (최대 200건)"', 'titleKey="admin_do_audit_card"'],
  ['? "audit_logs 테이블을 확인하세요."', '? t("admin_do_audit_table_missing")'],
  [
    `<code className="rounded bg-sam-app px-1 sam-text-helper">target_type = store_order</code> 감사 기록입니다. 전체
        감사는{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          감사 로그
        </Link>
        메뉴를 이용하세요.`,
    `{t("admin_do_audit_intro")}{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          {t("admin_do_audit_menu")}
        </Link>
        {t("admin_do_audit_menu_suffix")}`,
  ],
  ['<p className="text-sm text-sam-muted">기록이 없습니다.</p>', '<p className="text-sm text-sam-muted">{t("admin_do_common_no_records")}</p>'],
  ['<th className="px-2 py-2">시각</th>', '<th className="px-2 py-2">{t("admin_do_th_time")}</th>'],
  ['<th className="px-2 py-2">주문</th>', '<th className="px-2 py-2">{t("admin_do_common_order")}</th>'],
  ['<th className="px-2 py-2">행위자</th>', '<th className="px-2 py-2">{t("admin_do_th_actor")}</th>'],
  ['<th className="px-2 py-2">액션</th>', '<th className="px-2 py-2">{t("admin_do_common_action")}</th>'],
  ['.toLocaleString("ko-KR")', '.toLocaleString(doAdminLocale(language))'],
  ['{loading ? "갱신 중…" : "새로고침"}', '{loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}'],
  ['<p className="text-sm text-sam-muted">불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['불러오지 못했습니다 ({error}).', '{t("admin_do_common_load_failed", { error })}'],
]);

let audit = fs.readFileSync(path.join(dir, "DeliveryAuditLogsClient.tsx"), "utf8");
if (!audit.includes("doAdminLocale")) {
  audit = audit.replace(
    'import { useI18n } from "@/components/i18n/AppLanguageProvider";',
    'import { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport { doAdminLocale } from "./do-admin-locale";'
  );
  audit = audit.replace("const { t } = useI18n();", "const { t, language } = useI18n();");
}
w("DeliveryAuditLogsClient.tsx", audit);

console.log("batch2 done");
