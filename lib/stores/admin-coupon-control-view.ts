import type { MessageKey } from "@/lib/i18n/messages";
import { ownerCouponListStatus, ownerCouponListStatusMessageKey } from "@/lib/stores/owner-coupon-list-bucket";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminCouponOpaqueId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function formatAdminCouponDay(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function adminCouponLifecycleMessageKey(
  lifecycleState: string,
  startAt?: string | null,
  endAt?: string | null
): MessageKey {
  const st = String(lifecycleState ?? "");
  if (st === "revoked") return "store_coupon_wallet_status_revoked";
  if (st === "rejected") return "store_coupon_admin_reject";
  return ownerCouponListStatusMessageKey(ownerCouponListStatus({ lifecycle_state: st, start_at: startAt, end_at: endAt }));
}

export function adminCouponFundingMessageKey(fundingMode: string): MessageKey {
  const m = String(fundingMode ?? "");
  if (m === "PLATFORM_FUNDED") return "store_coupon_funding_platform";
  if (m === "SHARED_FUNDED") return "store_coupon_funding_shared";
  return "store_coupon_funding_store";
}

export function adminCouponTargetMessageKey(scope: string | null | undefined): MessageKey | null {
  const s = String(scope ?? "").trim();
  if (!s) return null;
  if (s === "STORE") return "store_coupon_target_store_first";
  if (s === "PLATFORM") return "store_coupon_target_platform_first";
  if (s === "ALL") return "store_coupon_target_all";
  return null;
}

export function adminCouponAuditActionMessageKey(action: string): MessageKey {
  const a = String(action ?? "").trim();
  if (a === "approve") return "store_coupon_admin_approve";
  if (a === "reject") return "store_coupon_admin_reject";
  if (a === "pause") return "store_coupon_owner_pause";
  if (a === "resume") return "store_coupon_owner_resume";
  if (a === "revoke") return "store_coupon_admin_revoke";
  if (a === "end") return "store_coupon_owner_end";
  return "store_coupon_admin_section_audit";
}

export function humanAdminStoreName(name: string | null | undefined): string | null {
  const n = String(name ?? "").trim();
  if (!n || isAdminCouponOpaqueId(n)) return null;
  return n;
}

export function humanAdminOrderNo(orderNo: string | null | undefined, orderId?: string | null): string | null {
  const no = String(orderNo ?? "").trim();
  if (no && !isAdminCouponOpaqueId(no)) return no;
  const id = String(orderId ?? "").trim();
  if (id && !isAdminCouponOpaqueId(id) && id.length <= 24) return id;
  return null;
}

export function looksLikeRawOperatorToken(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (isAdminCouponOpaqueId(v)) return true;
  if (v.includes("T") && /\d{4}-\d{2}-\d{2}T/.test(v)) return true;
  return /^[A-Z][A-Z0-9_]+$/.test(v) || /^[a-z][a-z0-9]+(?:_[a-z0-9]+)+$/.test(v);
}

export function adminCouponSettlementMessageKey(status: string | null | undefined): MessageKey | null {
  const s = String(status ?? "").trim();
  if (s === "scheduled") return "store_owner_settlement_status_scheduled";
  if (s === "processing") return "store_owner_settlement_status_processing";
  if (s === "paid") return "store_owner_settlement_status_paid";
  if (s === "held") return "store_owner_settlement_status_held";
  if (s === "cancelled") return "store_owner_settlement_status_cancelled";
  return null;
}
