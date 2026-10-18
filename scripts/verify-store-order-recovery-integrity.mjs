#!/usr/bin/env node
/**
 * Phase A — Recovery Integrity: cancel/refund/failure converge on apply Recovery Chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const transitions = read("lib/stores/order-status-transitions.ts");
const apply = read("lib/stores/apply-store-order-status-transition.ts");
const adminOps = read("lib/stores/apply-admin-store-order-operations.ts");
const refundAlias = read("lib/stores/apply-admin-store-order-refund.ts");
const payment = read("lib/stores/record-store-order-payment.ts");
const ownerCancel = read(
  "app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts"
);
const approveRefund = read("app/api/admin/store-orders/[orderId]/approve-refund/route.ts");

if (!transitions.includes('"cancel_requested"') || !transitions.includes("shouldRestoreStockOnCancel")) {
  fails.push("shouldRestoreStockOnCancel must cover cancel_requested");
}
if (!/cancel_requested[\s\S]*shouldRestoreStockOnCancel|shouldRestoreStockOnCancel[\s\S]*cancel_requested/.test(transitions)) {
  // explicit: cancel_requested listed inside shouldRestoreStockOnCancel body
  const fn = transitions.slice(transitions.indexOf("function shouldRestoreStockOnCancel"));
  if (!fn.includes('"cancel_requested"')) {
    fails.push("shouldRestoreStockOnCancel missing cancel_requested");
  }
}

if (!transitions.includes('"payment_failure"')) {
  fails.push("SYSTEM payment_failure purpose missing");
}

if (!apply.includes('eventType: "cancel_approved"') || !apply.includes('eventType: "cancel_rejected"')) {
  fails.push("apply must own cancel_approved/cancel_rejected events");
}

if (adminOps.includes('eventType: "cancel_approved"') || adminOps.includes('eventType: "cancel_rejected"')) {
  fails.push("admin ops must not emit duplicate cancel_approved/rejected");
}

if (!refundAlias.includes("adminCompleteRefundStoreOrder")) {
  fails.push("applyAdminStoreOrderRefund must alias adminCompleteRefundStoreOrder");
}

// approve-refund delegates to the admin intervention service (reason required), which owns the op.
const intervention = read("lib/stores/admin-store-order-intervention.ts");
if (!approveRefund.includes("runAdminStoreOrderIntervention") || !approveRefund.includes('"refund_approve"')) {
  fails.push("approve-refund route must use runAdminStoreOrderIntervention(refund_approve)");
}
if (!/case "refund_approve":[\s\S]*?adminCompleteRefundStoreOrder\(/.test(intervention)) {
  fails.push("intervention refund_approve must use adminCompleteRefundStoreOrder");
}

if (!payment.includes('systemPurpose: "payment_failure"')) {
  fails.push("payment failure must apply SYSTEM payment_failure cancel");
}

if (!payment.includes("applyStoreOrderStatusTransition")) {
  fails.push("payment failure missing apply Recovery Chain");
}

// 3단계: the owner cancels directly (never creates cancel_requested). A buyer request writes the
// ledger row and the status in one DB transaction (no ledger-then-delete in TS).
if (ownerCancel.includes('nextStatus: "cancel_requested"')) {
  fails.push("owner cancel route must not create cancel_requested (direct cancel only)");
}
const buyerOrder = read("app/api/me/store-orders/[orderId]/route.ts");
if (!buyerOrder.includes("buyerCancelRequestReason:") || /store_order_cancel_requests/.test(buyerOrder)) {
  fails.push("buyer cancel request must go through the atomic writer path (no ledger writes in the route)");
}
const writer = read("lib/stores/apply-store-order-status-transition.ts");
if (!writer.includes('sb.rpc("store_order_buyer_cancel_request_atomic"')) {
  fails.push("writer must create buyer cancel requests via store_order_buyer_cancel_request_atomic");
}

if (fails.length) {
  console.error("FAIL: store-order-recovery-integrity\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-recovery-integrity");
process.exit(0);
