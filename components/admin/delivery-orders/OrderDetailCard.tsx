"use client";

import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { formatKstDatetimeLong } from "@/lib/datetime/format-kst-datetime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OrderDetailCard({ order }: { order: AdminDeliveryOrder }) {
  const { t } = useI18n();

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_order_no")}</dt>
        <dd className="font-mono font-medium">{order.orderNo}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_ordered_at")}</dt>
        <dd>{formatKstDatetimeLong(order.createdAt)}</dd>
      </div>
      {order.acceptedAt ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_accepted")}</dt>
          <dd>{formatKstDatetimeLong(order.acceptedAt)}</dd>
        </div>
      ) : null}
      {order.estimatedPrepMinutes != null && order.estimatedPrepMinutes > 0 ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_prep_min")}</dt>
          <dd>{t("admin_do_minutes", { n: order.estimatedPrepMinutes })}</dd>
        </div>
      ) : null}
      {order.estimatedReadyAt ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_prep_done")}</dt>
          <dd>{formatKstDatetimeLong(order.estimatedReadyAt)}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_admin_lock")}</dt>
        <dd>
          {order.adminLocked ? t("admin_do_detail_dt_admin_lock_yes") : t("admin_do_detail_dt_admin_lock_no")}
        </dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_flag")}</dt>
        <dd>{order.adminFlagged ? t("admin_do_detail_dt_yes") : t("admin_do_detail_dt_no")}</dd>
      </div>
      {order.disputeStatus ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_dispute")}</dt>
          <dd className="font-medium text-amber-900">{order.disputeStatus}</dd>
        </div>
      ) : null}
      {order.adminNote?.trim() ? (
        <div className="sm:col-span-2">
          <dt className="text-sam-muted">{t("admin_do_detail_dt_ops_memo")}</dt>
          <dd className="whitespace-pre-wrap">{order.adminNote.trim()}</dd>
        </div>
      ) : null}
      {order.refundApprovedAt ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_refund_approved")}</dt>
          <dd>{formatKstDatetimeLong(order.refundApprovedAt)}</dd>
        </div>
      ) : null}
      {order.refundedAt ? (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_refund_done")}</dt>
          <dd>{formatKstDatetimeLong(order.refundedAt)}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_buyer")}</dt>
        <dd>
          {order.buyerName}{" "}
          <span className="text-xs text-sam-muted">({order.buyerUserId})</span>
        </dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_phone")}</dt>
        <dd>{order.buyerPhone}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_th_store")}</dt>
        <dd>{order.storeName}</dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_store_owner")}</dt>
        <dd>
          {order.storeOwnerName}{" "}
          <span className="text-xs text-sam-muted">({order.storeOwnerUserId})</span>
        </dd>
      </div>
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_order_type")}</dt>
        <dd>
          {order.orderType === "delivery" ? t("admin_do_order_type_delivery") : t("admin_do_order_type_pickup")}
        </dd>
      </div>
      {order.orderType === "delivery" ? (
        <div className="sm:col-span-2">
          <dt className="text-sam-muted">{t("admin_do_detail_dt_address")}</dt>
          <dd>{order.addressSummary}</dd>
        </div>
      ) : (
        <div>
          <dt className="text-sam-muted">{t("admin_do_detail_dt_pickup")}</dt>
          <dd>{order.pickupNote ?? "—"}</dd>
        </div>
      )}
      <div>
        <dt className="text-sam-muted">{t("admin_do_detail_dt_payment_choice")}</dt>
        <dd>{order.buyerCheckoutPaymentMethod?.trim() || "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-sam-muted">{t("admin_do_detail_dt_request")}</dt>
        <dd>{order.requestNote?.trim() || "—"}</dd>
      </div>
    </dl>
  );
}
