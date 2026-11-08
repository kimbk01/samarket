"use client";

/**
 * Store order audit rows in operator wording (감사 로그 화면 · 주문 상세 처리 이력).
 * Labels: lib/admin/store-orders/admin-store-order-audit-labels.ts. The raw action and
 * before/after JSON stay available behind 「기술 정보」 — rows are never rewritten.
 */
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  ADMIN_AUDIT_CATEGORY_LABEL,
  describeStoreOrderAudit,
} from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";

export type AdminOrderAuditRow = {
  id: string;
  created_at: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  before_json: unknown;
  after_json: unknown;
  /** Logs page only. */
  order_id?: string | null;
  order_no?: string | null;
};

export function AdminOrderAuditTable({
  rows,
  statusLabel,
  compact = false,
  onOpenOrder,
}: {
  rows: AdminOrderAuditRow[];
  statusLabel: (s: string) => string;
  compact?: boolean;
  /** Logs page: order number opens the shared detail modal. */
  onOpenOrder?: (orderId: string) => void;
}) {
  const { language, t } = useI18n();
  const ko = language === "ko";

  if (rows.length === 0) {
    return <p className="sam-text-helper text-sam-muted">{t("admin_store_orders_no_history")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left sam-text-helper ${compact ? "min-w-[560px]" : "min-w-[980px]"}`}>
        <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
          <tr>
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_time")}</th>
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_by")}</th>
            {onOpenOrder ? <th className="px-2 py-2 font-medium">{t("admin_store_orders_order")}</th> : null}
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_action")}</th>
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_status")}</th>
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_reason")}</th>
            <th className="px-2 py-2 font-medium">{t("admin_store_orders_details")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = describeStoreOrderAudit(r, ko);
            const cat = ADMIN_AUDIT_CATEGORY_LABEL[v.category];
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top last:border-b-0" data-audit-category={v.category}>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-sam-muted">{formatManilaDateTime(r.created_at)}</td>
                <td className="px-2 py-2 text-sam-fg">
                  <div>{r.actor_label ?? (ko ? cat.ko : cat.en)}</div>
                  <div className="sam-text-xxs text-sam-muted" title={r.actor_id ?? ""}>
                    {ko ? cat.ko : cat.en}
                  </div>
                </td>
                {onOpenOrder ? (
                  <td className="whitespace-nowrap px-2 py-2">
                    {r.order_id ? (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        className="!px-0 font-mono"
                        onClick={() => onOpenOrder(r.order_id as string)}
                      >
                        {r.order_no || (t("admin_store_orders_open"))}
                      </AdminActionButton>
                    ) : (
                      <span className="text-sam-muted">—</span>
                    )}
                  </td>
                ) : null}
                <td className="px-2 py-2 text-sam-fg">{v.label}</td>
                <td className="whitespace-nowrap px-2 py-2 text-sam-fg">
                  {v.fromStatus || v.toStatus ? `${v.fromStatus ? statusLabel(v.fromStatus) : "—"} → ${v.toStatus ? statusLabel(v.toStatus) : "—"}` : "—"}
                </td>
                <td className="max-w-[260px] px-2 py-2 text-sam-fg [overflow-wrap:anywhere]">{v.reason ?? "—"}</td>
                <td className="px-2 py-2">
                  <AdminTechDetails ko={ko}>
                    <pre className="max-w-[420px] overflow-x-auto whitespace-pre-wrap rounded-ui-rect bg-sam-app p-2 sam-text-xxs text-sam-muted">
                      {JSON.stringify({ action: r.action, actor_type: r.actor_type, actor_id: r.actor_id, before: r.before_json, after: r.after_json }, null, 2)}
                    </pre>
                  </AdminTechDetails>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
