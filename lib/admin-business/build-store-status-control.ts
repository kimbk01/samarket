/**
 * Admin Business Control Center — STORE STATUS CONTROL (read model only).
 * DO NOT merge axes into one status. DO NOT invent writers.
 * Reuses resolveStoreFrontCommerceState (Customer/Checkout SSOT).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveStoreFrontCommerceState,
  type StoreFrontCommerceState,
} from "@/lib/stores/store-auto-hours";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcSalesPermission,
} from "@/lib/admin-business/load-business-control-center-detail";

export type StoreStatusAxisId =
  | "approval"
  | "visibility"
  | "sales"
  | "front_open"
  | "hours"
  | "delivery_channel"
  | "pickup_channel"
  | "distance_policy"
  | "sanction";

export type StoreStatusAuthority = "admin" | "owner" | "system" | "admin_or_owner";

export type StoreStatusAxisRow = {
  id: StoreStatusAxisId;
  /** Current value (display string; never an i18n key) */
  value: string;
  meaningKey: MessageKey;
  writerKey: MessageKey;
  customerEffectKey: MessageKey;
  orderEffectKey: MessageKey;
  authority: StoreStatusAuthority;
};

export type StoreStatusControlInput = {
  approvalStatus: string;
  isVisible: boolean;
  sales: BusinessCcSalesPermission;
  delivery: BusinessCcDeliverySnapshot;
  commerce: StoreFrontCommerceState;
  hoursLabel: string | null;
  suspendedReason: string | null;
};

function yn(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "yes" : "no";
}

export function buildStoreStatusControl(input: StoreStatusControlInput): StoreStatusAxisRow[] {
  const sales = input.sales;
  const salesValue = sales
    ? `${sales.sales_status || "—"} / allowed=${sales.allowed_to_sell ? "yes" : "no"}`
    : "—";
  const front = input.commerce.isOpenForCommerce
    ? input.commerce.inBreak
      ? "break"
      : "open"
    : "closed";
  const hoursValue =
    input.hoursLabel?.trim() ||
    (input.commerce.breakConfigured
      ? `break ${input.commerce.breakRangeLabel}`
      : "manual / no auto schedule");
  const distanceValue = input.delivery.distancePolicyEnabled
    ? `${input.delivery.policySource}${
        input.delivery.maxKm != null ? ` / max ${input.delivery.maxKm}km` : " / no max"
      }`
    : "policy_off";
  const sanctionValue =
    input.approvalStatus === "suspended"
      ? input.suspendedReason?.trim()
        ? `suspended: ${input.suspendedReason.trim()}`
        : "suspended"
      : "none";

  return [
    {
      id: "approval",
      value: input.approvalStatus || "—",
      meaningKey: "admin_biz_status_axis_approval_meaning",
      writerKey: "admin_biz_status_axis_approval_writer",
      customerEffectKey: "admin_biz_status_axis_approval_customer",
      orderEffectKey: "admin_biz_status_axis_approval_order",
      authority: "admin",
    },
    {
      id: "visibility",
      value: yn(input.isVisible),
      meaningKey: "admin_biz_status_axis_visibility_meaning",
      writerKey: "admin_biz_status_axis_visibility_writer",
      customerEffectKey: "admin_biz_status_axis_visibility_customer",
      orderEffectKey: "admin_biz_status_axis_visibility_order",
      authority: "admin",
    },
    {
      id: "sales",
      value: salesValue,
      meaningKey: "admin_biz_status_axis_sales_meaning",
      writerKey: "admin_biz_status_axis_sales_writer",
      customerEffectKey: "admin_biz_status_axis_sales_customer",
      orderEffectKey: "admin_biz_status_axis_sales_order",
      authority: "admin",
    },
    {
      id: "front_open",
      value: front,
      meaningKey: "admin_biz_status_axis_front_open_meaning",
      writerKey: "admin_biz_status_axis_front_open_writer",
      customerEffectKey: "admin_biz_status_axis_front_open_customer",
      orderEffectKey: "admin_biz_status_axis_front_open_order",
      authority: "admin_or_owner",
    },
    {
      id: "hours",
      value: hoursValue,
      meaningKey: "admin_biz_status_axis_hours_meaning",
      writerKey: "admin_biz_status_axis_hours_writer",
      customerEffectKey: "admin_biz_status_axis_hours_customer",
      orderEffectKey: "admin_biz_status_axis_hours_order",
      authority: "admin_or_owner",
    },
    {
      id: "delivery_channel",
      value: yn(input.delivery.deliveryAvailable),
      meaningKey: "admin_biz_status_axis_delivery_meaning",
      writerKey: "admin_biz_status_axis_delivery_writer",
      customerEffectKey: "admin_biz_status_axis_delivery_customer",
      orderEffectKey: "admin_biz_status_axis_delivery_order",
      authority: "admin_or_owner",
    },
    {
      id: "pickup_channel",
      value: yn(input.delivery.pickupAvailable),
      meaningKey: "admin_biz_status_axis_pickup_meaning",
      writerKey: "admin_biz_status_axis_pickup_writer",
      customerEffectKey: "admin_biz_status_axis_pickup_customer",
      orderEffectKey: "admin_biz_status_axis_pickup_order",
      authority: "admin_or_owner",
    },
    {
      id: "distance_policy",
      value: distanceValue,
      meaningKey: "admin_biz_status_axis_distance_meaning",
      writerKey: "admin_biz_status_axis_distance_writer",
      customerEffectKey: "admin_biz_status_axis_distance_customer",
      orderEffectKey: "admin_biz_status_axis_distance_order",
      authority: "admin",
    },
    {
      id: "sanction",
      value: sanctionValue,
      meaningKey: "admin_biz_status_axis_sanction_meaning",
      writerKey: "admin_biz_status_axis_sanction_writer",
      customerEffectKey: "admin_biz_status_axis_sanction_customer",
      orderEffectKey: "admin_biz_status_axis_sanction_order",
      authority: "admin",
    },
  ];
}

/** Shared with loader — same open SSOT as checkout. */
export function resolveCommerceForStatusControl(
  businessHoursJson: unknown,
  dbIsOpen: boolean | null | undefined
): StoreFrontCommerceState {
  return resolveStoreFrontCommerceState(businessHoursJson, dbIsOpen);
}
