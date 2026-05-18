import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "components/admin/delivery-orders");
const el = "motion.div".replace("motion.", "");

function w(name, content) {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
  console.log("wrote", name);
}

function migrate(name, patches, extra = "") {
  let c = fs.readFileSync(path.join(dir, name), "utf8");
  if (!c.includes("useI18n")) {
    c = c.replace(
      '"use client";\n',
      `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n${extra}`
    );
  }
  if (!c.includes("const { t }") && !c.includes("const { t,")) {
    c = c.replace(/export function (\w+)\([^)]*\) \{\n/, (m) => `${m}  const { t } = useI18n();\n`);
  }
  for (const [from, to] of patches) {
    if (!c.includes(from)) console.warn(name, "missing:", from.slice(0, 60));
    c = c.split(from).join(to);
  }
  w(name, c);
}

// OrderTable — rewrite helpers inside component
w(
  "OrderTable.tsx",
  `"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  SettlementStatusBadge,
} from "./DeliveryOrderBadges";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatKstDatetimeLong } from "@/lib/datetime/format-kst-datetime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type OrderTableSelection = {
  selectedIds: ReadonlySet<string>;
  onToggleRow: (orderId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
};

function shortId(id: string, len = 8) {
  if (!id) return "—";
  return id.length <= len ? id : \`\${id.slice(0, len)}…\`;
}

export function OrderTable({ rows, selection }: { rows: AdminDeliveryOrder[]; selection?: OrderTableSelection }) {
  const { t } = useI18n();

  const itemsLineSummary = (o: AdminDeliveryOrder): string => {
    if (!o.items?.length) return t("admin_do_no_items");
    return o.items.map((it) => \`\${it.menuName}×\${it.qty}\`).join(", ");
  };

  const fulfillmentSummary = (o: AdminDeliveryOrder): string => {
    if (o.orderType === "delivery") {
      const parts = [o.addressSummary, o.addressDetail].filter((x) => x && String(x).trim());
      return parts.length ? parts.join(" · ") : t("admin_do_no_address");
    }
    return o.pickupNote?.trim() ? t("admin_do_pickup_memo", { note: o.pickupNote }) : t("admin_do_pickup");
  };

  const slaBadgeLabel = (o: AdminDeliveryOrder): string | null => {
    const level = (o.slaWarningLevel ?? "").trim();
    const reason = (o.slaWarningReason ?? "").trim();
    if (!level && !reason && !o.needsAdminAttention) return null;
    if (reason === "pending_over_5m") return t("admin_do_sla_pending");
    if (reason === "eta_overdue") return t("admin_do_sla_eta");
    if (reason === "delivery_over_60m") return t("admin_do_sla_long_delivery");
    if (reason === "unassigned_over_10m") return t("admin_do_sla_unassigned");
    if (reason === "refund_overdue") return t("admin_do_sla_refund");
    if (o.needsAdminAttention) return t("admin_do_needs_attention");
    return level ? \`SLA \${level}\` : "SLA";
  };

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected =
    selection != null &&
    visibleIds.length > 0 &&
    visibleIds.every((id) => selection.selectedIds.has(id));
  const someVisibleSelected =
    selection != null && visibleIds.some((id) => selection.selectedIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const elRef = selectAllRef.current;
    if (elRef) {
      elRef.indeterminate = Boolean(someVisibleSelected && !allVisibleSelected);
    }
  }, [someVisibleSelected, allVisibleSelected]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-sam-muted">{t("admin_do_orders_empty")}</p>;
  }

  return (
    <${el} className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[1240px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
            {selection ? (
              <th className="w-10 px-2 py-2 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => selection.onToggleAllVisible(e.target.checked)}
                  className="rounded border-sam-border"
                  title={t("admin_do_select_all_aria")}
                  aria-label={t("admin_do_select_all_aria")}
                />
              </th>
            ) : null}
            <th className="px-2 py-2">{t("admin_do_th_order_no")}</th>
            <th className="px-2 py-2">{t("admin_do_th_date")}</th>
            <th className="px-2 py-2 min-w-[160px]">{t("admin_do_th_buyer_contact")}</th>
            <th className="px-2 py-2 min-w-[160px]">{t("admin_do_th_store_ops")}</th>
            <th className="px-2 py-2 min-w-[220px]">{t("admin_do_th_delivery_request")}</th>
            <th className="px-2 py-2">{t("admin_do_th_method")}</th>
            <th className="px-2 py-2">{t("admin_do_th_amount")}</th>
            <th className="px-2 py-2">{t("admin_do_th_payment")}</th>
            <th className="px-2 py-2">{t("admin_do_th_order_status")}</th>
            <th className="px-2 py-2">{t("admin_do_th_settlement")}</th>
            <th className="px-2 py-2">{t("admin_do_th_report")}</th>
            <th className="px-2 py-2">{t("admin_do_th_measure")}</th>
            <th className="px-2 py-2">{t("admin_do_common_action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const src = o.orderSource ?? "store_db";
            const detailHref =
              src === "store_db"
                ? \`/admin/store-orders?order_id=\${encodeURIComponent(o.id)}\`
                : \`/admin/stores/orders/\${encodeURIComponent(o.id)}\`;
            const sla = slaBadgeLabel(o);
            return (
              <tr key={\`\${src}-\${o.id}\`} className="border-b border-sam-border-soft align-top hover:bg-sam-app/80">
                {selection ? (
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selection.selectedIds.has(o.id)}
                      onChange={(e) => selection.onToggleRow(o.id, e.target.checked)}
                      className="rounded border-sam-border"
                      aria-label={t("admin_do_select_order_aria", { orderNo: o.orderNo })}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-2 font-mono sam-text-helper whitespace-nowrap">{o.orderNo}</td>
                <td className="px-2 py-2 whitespace-nowrap text-sam-muted">
                  {formatKstDatetimeLong(o.createdAt)}
                  {sla ? (
                    <${el} className="mt-1">
                      <span className="inline-flex items-center rounded bg-rose-100 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
                        {sla}
                      </span>
                    </${el}>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <${el} className="font-medium">{o.buyerName || "—"}</${el}>
                  <${el} className="sam-text-helper text-sam-muted" title={o.buyerPhone}>
                    {o.buyerPhone?.trim() ? o.buyerPhone : t("admin_do_no_phone")}
                  </${el}>
                  <${el} className="font-mono sam-text-xxs text-sam-muted" title={o.buyerUserId}>
                    {t("admin_do_member_id", { id: shortId(o.buyerUserId, 12) })}
                  </${el}>
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <${el} className="max-w-[200px] truncate font-medium" title={o.storeName}>
                    {o.storeName}
                  </${el}>
                  <${el} className="sam-text-helper text-sam-muted">
                    {o.storeSlug ? (
                      <span title={o.storeSlug}>/{o.storeSlug}</span>
                    ) : (
                      <span className="text-sam-meta">{t("admin_do_no_slug")}</span>
                    )}
                  </${el}>
                  <${el} className="sam-text-xxs text-sam-muted">
                    {t("admin_do_owner", { name: o.storeOwnerName || "—" })}{" "}
                    <span className="font-mono text-sam-meta" title={o.storeOwnerUserId}>
                      · {shortId(o.storeOwnerUserId)}
                    </span>
                  </${el}>
                  <${el} className="font-mono sam-text-xxs text-sam-meta" title={o.storeId}>
                    {t("admin_do_store_id", { id: shortId(o.storeId, 12) })}
                  </${el}>
                </td>
                <td className="px-2 py-2 text-sam-fg">
                  <${el} className="sam-text-helper leading-snug" title={itemsLineSummary(o)}>
                    {itemsLineSummary(o)}
                  </${el}>
                  <${el} className="mt-1 sam-text-xxs leading-snug text-sam-muted" title={fulfillmentSummary(o)}>
                    {fulfillmentSummary(o)}
                  </${el}>
                  {o.requestNote?.trim() ? (
                    <${el}
                      className="mt-1 rounded bg-signature/5 px-1.5 py-0.5 sam-text-xxs text-sam-fg"
                      title={o.requestNote}
                    >
                      {t("admin_do_request_note", {
                        note: o.requestNote.length > 80 ? \`\${o.requestNote.slice(0, 80)}…\` : o.requestNote,
                      })}
                    </${el}>
                  ) : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {o.orderType === "delivery" ? t("admin_do_order_type_delivery") : t("admin_do_order_type_pickup")}
                </td>
                <td className="px-2 py-2 whitespace-nowrap font-medium">{formatMoneyPhp(o.finalAmount)}</td>
                <td className="px-2 py-2">
                  <PaymentStatusBadge status={o.paymentStatus} />
                </td>
                <td className="px-2 py-2">
                  <OrderStatusBadge status={o.orderStatus} />
                </td>
                <td className="px-2 py-2">
                  <SettlementStatusBadge status={o.settlementStatus} />
                </td>
                <td className="px-2 py-2 text-center">{o.hasReport ? "⚠" : "—"}</td>
                <td className="px-2 py-2">
                  <AdminActionStatusBadge status={o.adminActionStatus} />
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <Link href={detailHref} className="font-medium text-signature hover:underline">
                    {t("admin_do_common_detail")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </${el}>
  );
}
`
);

const detailPatches = [
  ['import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";', 'import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";'],
  ["export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {\n  const [loading", "export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {\n  const { t } = useI18n();\n  const [loading"],
  ['title="주문 상세"', 'titleKey="admin_do_detail_title"'],
  ['<p className="text-sm text-sam-muted">원장 불러오는 중…</p>', '<p className="text-sm text-sam-muted">{t("admin_do_common_ledger_loading")}</p>'],
  ['<p className="text-sm text-sam-muted">주문을 찾을 수 없습니다.</p>', '<p className="text-sm text-sam-muted">{t("admin_do_detail_not_found")}</p>'],
  ['매장 주문(액션)에서 order_id로 검색', '{t("admin_do_detail_search_hint")}'],
  ['? "취소 요청 대기"', '? t("admin_do_cancel_pending")'],
  ['? "취소 승인됨"', '? t("admin_do_cancel_approved")'],
  ['? "취소 요청 거절"', '? t("admin_do_cancel_rejected")'],
  ['? "취소 완료"', '? t("admin_do_cancel_done")'],
  ['? "환불 요청 대기"', '? t("admin_do_refund_pending")'],
  ['? "환불 승인됨"', '? t("admin_do_refund_approved")'],
  ['? "환불 거절"', '? t("admin_do_refund_rejected")'],
  ['? "환불 완료"', '? t("admin_do_refund_done")'],
  ['title={`주문 ${order.orderNo}`}', 'title={`${t("admin_do_common_order")} ${order.orderNo}`}'],
  ['원장 · 품목 스냅샷', '{t("admin_do_detail_ledger_subtitle")}'],
  ['주문 채팅', '{t("admin_do_order_chat")}'],
  [' · 메신저 배달 채팅 원장', '{t("admin_do_detail_messenger_ledger")}'],
  ['title="기본 정보"', 'titleKey="admin_do_card_basic"'],
  ['title="주문 항목"', 'titleKey="admin_do_card_items"'],
  ['title="금액"', 'titleKey="admin_do_card_amount"'],
  ['title="상태 정보"', 'titleKey="admin_do_card_status"'],
  ['<dt className="text-sam-muted">결제상태</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_payment_status")}</dt>'],
  ['<dt className="text-sam-muted">주문상태</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_order_status")}</dt>'],
  ['<dt className="text-sam-muted">취소 상태</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_cancel_status")}</dt>'],
  ['<dt className="text-sam-muted">환불 상태</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_refund_status")}</dt>'],
  ['<dt className="text-sam-muted">정산상태</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_settlement_status")}</dt>'],
  ['title="취소·환불 요청"', 'titleKey="admin_do_card_cancel_refund_req"'],
  ['<p className="font-semibold">취소 요청 ({order.cancelRequest.status})</p>', '<p className="font-semibold">{t("admin_do_cancel_req", { status: order.cancelRequest.status })}</p>'],
  ['환불 요청 ({order.refundRequest.status}) · {order.refundRequest.requestedBy}', '{t("admin_do_refund_req", { status: order.refundRequest.status, by: order.refundRequest.requestedBy })}'],
  ['title="취소·환불 사유(확정)"', 'titleKey="admin_do_card_cancel_refund_reason"'],
  ['<p className="text-sm">취소: {order.cancelReason}</p>', '<p className="text-sm">{t("admin_do_cancel_label", { reason: order.cancelReason })}</p>'],
  ['<p className="text-sm">환불: {order.refundReason}</p>', '<p className="text-sm">{t("admin_do_refund_label", { reason: order.refundReason })}</p>'],
  ['title="정산"', 'titleKey="admin_do_card_settlement"'],
  ['<dt className="text-sam-muted">총매출</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_gross_sales")}</dt>'],
  ['<dt className="text-sam-muted">수수료</dt>', '<dt className="text-sam-muted">{t("admin_do_dt_fee")}</dt>'],
  ['<dt>정산예정액</dt>', '<dt>{t("admin_do_dt_settlement_due")}</dt>'],
  ['예정일: {order.settlement.scheduledDate}', '{t("admin_do_dt_scheduled_date", { date: order.settlement.scheduledDate })}'],
  ['보류: {order.settlement.holdReason}', '{t("admin_do_dt_hold_reason", { reason: order.settlement.holdReason })}'],
  ['title="신고·분쟁"', 'titleKey="admin_do_card_dispute"'],
  ['<p className="text-sm text-amber-900">이 주문에 신고·분쟁 플래그가 있습니다.</p>', '<p className="text-sm text-amber-900">{t("admin_do_dispute_flag")}</p>'],
  ['<span className="text-sam-muted">분쟁 메모: </span>', '<span className="text-sam-muted">{t("admin_do_dispute_memo")}</span>'],
  ['신고·분쟁 콘솔로 이동', '{t("admin_do_go_dispute_console")}'],
  ['title="플랫폼 운영 조치"', 'titleKey="admin_do_card_platform_ops"'],
  ['동일 <code className="rounded bg-sam-app px-1 sam-text-helper">store_orders</code> 원장을 직접 갱신합니다. 강제\n          처리 시 감사 로그가 남습니다.', '{t("admin_do_ops_intro")}'],
  ['if (!confirm("주문을 강제 취소할까요? (완료·환불된 주문은 거절됩니다)"))', 'if (!confirm(t("admin_do_confirm_force_cancel")))'],
  ['강제 취소', '{t("admin_do_force_cancel")}'],
  ['if (!confirm("환불 요청 상태로 올릴까요?"))', 'if (!confirm(t("admin_do_confirm_refund_request")))'],
  ['환불 요청 처리', '{t("admin_do_refund_request")}'],
  ['if (!confirm("환불 완료(원장·재고·정산 반영)를 진행할까요?"))', 'if (!confirm(t("admin_do_confirm_refund_complete")))'],
  ['환불 완료', '{t("admin_do_refund_complete")}'],
  ['잠금 {order.adminLocked ? "해제" : "설정"}', '{t("admin_do_lock_toggle", { state: order.adminLocked ? t("admin_do_toggle_off") : t("admin_do_toggle_on") })}'],
  ['경고 {order.adminFlagged ? "해제" : "설정"}', '{t("admin_do_flag_toggle", { state: order.adminFlagged ? t("admin_do_toggle_off") : t("admin_do_toggle_on") })}'],
  ['긴급 플래그', '{t("admin_do_urgent_flag")}'],
  ['긴급 해제', '{t("admin_do_urgent_clear")}'],
  ['<span className="text-sam-muted">운영 메모</span>', '<span className="text-sam-muted">{t("admin_do_ops_memo")}</span>'],
  ['메모 저장', '{t("admin_do_save_memo")}'],
  ['매장 주문(액션)', '{t("admin_do_nav_store_orders")}'],
  ['감사 로그 새로고침', '{t("admin_do_refresh_audit")}'],
  ['title="상태·감사 로그"', 'titleKey="admin_do_card_audit_log"'],
  ['<p className="mt-2 text-sm text-sam-muted">불러오는 중…</p>', '<p className="mt-2 text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>'],
  ['사용자 매장 상세', '{t("admin_do_user_store_detail")}'],
];

migrate("DeliveryOrderDetailClient.tsx", detailPatches);

const dashPatches = [
  ['import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";', 'import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";'],
  ["export function DeliveryOrdersDashboardClient() {\n  const [filters", "export function DeliveryOrdersDashboardClient() {\n  const { t } = useI18n();\n  const [filters"],
  ['setActionMessage("선택한 주문을 이 화면 목록에서만 숨겼습니다. 브라우저 새로고침(F5) 시 다시 보입니다.");', 'setActionMessage(t("admin_do_msg_hidden_from_list"));'],
  [
    '`선택 ${ids.length}건을 DB(store_orders)에서 영구 삭제합니다.\\n연결된 품목·정산·리뷰·주문 채팅방 등이 함께 정리될 수 있습니다. 계속할까요?`',
    't("admin_do_msg_delete_confirm", { count: ids.length })',
  ],
  ['setActionMessage(data.error ?? "삭제 요청에 실패했습니다.");', 'setActionMessage(data.error ?? t("admin_do_msg_delete_failed"));'],
  [
    '? `${deleted.length}건 DB 삭제 완료. 실패 ${data.errors.length}건: ${data.errors',
    '? t("admin_do_msg_delete_partial", { ok: deleted.length, fail: data.errors.length, errors: data.errors',
  ],
  [
    ': `삭제 실패 ${data.errors.length}건: ${data.errors',
    ': t("admin_do_msg_delete_all_failed", { fail: data.errors.length, errors: data.errors',
  ],
  ['setActionMessage(`${deleted.length}건을 DB에서 삭제했습니다.`);', 'setActionMessage(t("admin_do_msg_delete_ok", { count: deleted.length }));'],
  ['setActionMessage("네트워크 오류로 삭제에 실패했습니다.");', 'setActionMessage(t("admin_do_msg_delete_network"));'],
  ['{ href: "/admin/stores/orders", label: "주문 목록" }', '{ href: "/admin/stores/orders", label: t("admin_do_nav_order_list") }'],
  ['{ href: "/admin/store-orders", label: "매장 주문(액션)" }', '{ href: "/admin/store-orders", label: t("admin_do_nav_store_orders") }'],
  ['{ href: "/admin/order-chats", label: "주문 채팅" }', '{ href: "/admin/order-chats", label: t("admin_do_nav_order_chat") }'],
  ['{ href: "/admin/order-notifications", label: "운영 알림" }', '{ href: "/admin/order-notifications", label: t("admin_do_nav_ops_alerts") }'],
  ['{ href: "/admin/stores/orders/cancellations", label: "취소" }', '{ href: "/admin/stores/orders/cancellations", label: t("admin_do_nav_cancellations") }'],
  ['{ href: "/admin/stores/orders/refunds", label: "환불" }', '{ href: "/admin/stores/orders/refunds", label: t("admin_do_nav_refunds") }'],
  ['{ href: "/admin/stores/orders/settlements", label: "정산" }', '{ href: "/admin/stores/orders/settlements", label: t("admin_do_nav_settlements") }'],
  ['{ href: "/admin/stores/orders/reports", label: "신고·분쟁" }', '{ href: "/admin/stores/orders/reports", label: t("admin_do_nav_reports") }'],
  ['{ href: "/admin/stores/orders/logs", label: "로그" }', '{ href: "/admin/stores/orders/logs", label: t("admin_do_nav_logs") }'],
  [
    'title="배달·포장 주문 (실데이터)"\n        description="Supabase store_orders 원장만 표시합니다. 결제·환불 등 처리는 «매장 주문(액션)»에서 진행하세요."',
    'titleKey="admin_do_dashboard_title"\n        descriptionKey="admin_do_dashboard_desc"',
  ],
  ['title="데이터 원장"', 'titleKey="admin_do_dashboard_ledger_card"'],
  [
    '이 화면 목록은 <code className="rounded bg-sam-surface-muted px-1 sam-text-xxs">store_orders</code> 와 품목 스냅샷을\n          API로 불러온 결과입니다.{" "}\n          <Link href="/admin/store-orders" className="font-medium text-signature underline">\n            매장 주문(액션)\n          </Link>\n          과 <strong>같은 DB</strong>입니다. 한쪽에서 <strong>DB에서 삭제</strong>하면 서버에는 바로 반영되고, 다른\n          탭으로 돌아오면 자동으로 목록을 다시 불러오며(탭 복귀 시), 보이는 동안 약 30초마다도 갱신됩니다.',
    '{t("admin_do_dashboard_ledger_intro")}{" "}\n          <Link href="/admin/store-orders" className="font-medium text-signature underline">\n            {t("admin_do_nav_store_orders")}\n          </Link>\n          {t("admin_do_dashboard_ledger_same_db")}',
  ],
  [
    '<strong className="text-sam-fg">목록에서만 제거</strong>는 이 브라우저 세션에서 표시만 숨깁니다.{" "}\n          <strong className="text-red-800">DB에서 삭제</strong>는 원장에서 영구 삭제합니다.',
    '{t("admin_do_dashboard_ledger_hide_list")}{" "}{t("admin_do_dashboard_ledger_db_delete")}',
  ],
  ['매장 주문(액션)으로 이동', '{t("admin_do_dashboard_go_store_orders")}'],
  ['{dbLoading ? "목록 갱신 중…" : "목록 새로고침"}', '{dbLoading ? t("admin_do_common_list_refreshing") : t("admin_do_common_list_refresh")}'],
  ['주문 목록을 불러오지 못했습니다 ({dbError}). Supabase 설정·관리자 로그인을 확인하세요.', '{t("admin_do_dashboard_list_load_failed", { error: dbError })}'],
  ['title="KPI (현재 목록 기준 · 최대 500건)"', 'titleKey="admin_do_dashboard_kpi_card"'],
  ['title="긴급 운영 큐 (필터 적용 결과 기준)"', 'titleKey="admin_do_dashboard_urgent_card"'],
  ['SLA 초과·방치·미배차·환불 지연 등 운영 우선 처리 대상입니다. (표에서 붉은 SLA 배지로 표시)', '{t("admin_do_dashboard_urgent_hint")}'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">미배차</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_unassigned")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">ETA 초과</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_eta")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">장기 배송</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_long_delivery")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">환불 지연</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_refund")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">주문 방치</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_pending")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-fg">기타</p>', '<p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_other")}</p>'],
  ['{urgentBuckets.unassigned}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.unassigned })}'],
  ['{urgentBuckets.eta}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.eta })}'],
  ['{urgentBuckets.delivering}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.delivering })}'],
  ['{urgentBuckets.refund}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.refund })}'],
  ['{urgentBuckets.pending}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.pending })}'],
  ['{urgentBuckets.other}건', '{t("admin_do_common_count_unit", { count: urgentBuckets.other })}'],
  ['총 <strong className="text-sam-fg">{urgentRows.length}</strong>건', '{t("admin_do_dashboard_urgent_total", { count: urgentRows.length })}'],
  ['<h2 className="mb-2 text-sm font-semibold text-sam-fg">주문 목록</h2>', '<h2 className="mb-2 text-sm font-semibold text-sam-fg">{t("admin_do_dashboard_order_list")}</h2>'],
  [
    '전체 <strong>{dbOrders.length}</strong>건 · 필터 일치 <strong>{filteredRows.length}</strong>건 · 표시{" "}\n          <strong>{visibleRows.length}</strong>건\n          {dbLoading ? " · 갱신 중…" : ""}',
    '{t("admin_do_dashboard_stats", { total: dbOrders.length, filtered: filteredRows.length, visible: visibleRows.length })}{dbLoading ? t("admin_do_dashboard_stats_refreshing") : ""}',
  ],
  ['선택 <strong className="text-sam-fg">{selectedIds.size}</strong>건', '{t("admin_do_dashboard_selected", { count: selectedIds.size })}'],
  ['현재 목록 전체 선택', '{t("admin_do_dashboard_select_all")}'],
  ['선택 해제', '{t("admin_do_dashboard_clear_selection")}'],
  ['목록에서만 제거', '{t("admin_do_dashboard_hide_from_list")}'],
  ['DB에서 삭제', '{t("admin_do_dashboard_delete_from_db")}'],
  [
    '표시할 주문이 없습니다. 목록에서만 숨긴 상태라면 브라우저 새로고침(F5)으로 숨김이 초기화됩니다.',
    '{t("admin_do_dashboard_empty_visible")}',
  ],
];

migrate("DeliveryOrdersDashboardClient.tsx", dashPatches);

// Fix dashboard delete message template - manual fix for partial message
let dash = fs.readFileSync(path.join(dir, "DeliveryOrdersDashboardClient.tsx"), "utf8");
if (dash.includes("admin_do_msg_delete_partial")) {
  dash = dash.replace(
    /setActionMessage\(\s*deleted\.length > 0\s*\? t\("admin_do_msg_delete_partial"[\s\S]*?join\(" \/ "\)\)\s*\)/,
    `setActionMessage(
          deleted.length > 0
            ? t("admin_do_msg_delete_partial", {
                ok: deleted.length,
                fail: data.errors.length,
                errors: data.errors.map((e) => \`\${e.id.slice(0, 8)}… \${e.message}\`).join(" / "),
              })
            : t("admin_do_msg_delete_all_failed", {
                fail: data.errors.length,
                errors: data.errors.map((e) => \`\${e.id.slice(0, 8)}… \${e.message}\`).join(" / "),
              })
        )`
  );
}
w("DeliveryOrdersDashboardClient.tsx", dash);

console.log("batch3 done");
