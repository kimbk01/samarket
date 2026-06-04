import type { AppLanguageCode } from "@/lib/i18n/config";
import { fetchOwnerStoreOrderDetailDeduped, ownerStoreOrderDetailFlightKey } from "@/lib/business/fetch-owner-store-order-detail";
import {
  formatOwnerOrderPatchErr,
  formatOwnerOrderPatchErrAfterReconcile,
} from "@/lib/business/owner-order-patch-errors";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { parseOwnerStoreOrderListRowFromApi } from "@/lib/business/owner-store-order-list-row-bridge";
import {
  patchOwnerStoreOrderStatus,
  postOwnerStoreOrderCancelRequest,
} from "@/lib/business/patch-owner-store-order-status";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type OwnerStoreOrderMutationCallbacks = {
  onPatchOrderRow: (orderId: string, patch: Partial<OwnerStoreOrderListRow>) => void;
  onReconcileOrder?: (orderId: string) => void | Promise<void>;
};

export type OwnerStoreOrderMutationResult =
  | { ok: true; order_status: string }
  | { ok: false; error: string; displayMessage: string };

function mutationFlightKey(storeId: string, orderId: string, action: string): string {
  return `owner:store-order-mutation:${storeId.trim()}:${orderId.trim()}:${action}`;
}

async function reconcileOrderRowFromDetail(
  storeId: string,
  orderId: string,
  callbacks: OwnerStoreOrderMutationCallbacks
): Promise<boolean> {
  forgetSingleFlight(ownerStoreOrderDetailFlightKey(storeId, orderId));
  const result = await fetchOwnerStoreOrderDetailDeduped(storeId, orderId);
  if (!result.ok || !result.order) return false;
  const parsed = parseOwnerStoreOrderListRowFromApi({
    ...result.order,
    delivery: result.delivery ?? undefined,
  });
  if (!parsed) return false;
  callbacks.onPatchOrderRow(orderId, {
    order_status: parsed.order_status,
    updated_at: parsed.updated_at,
    estimated_prep_minutes: parsed.estimated_prep_minutes,
    estimated_ready_at: parsed.estimated_ready_at,
    accepted_at: parsed.accepted_at,
    payment_status: parsed.payment_status,
    delivery: parsed.delivery ?? null,
  });
  await callbacks.onReconcileOrder?.(orderId);
  return true;
}

function failureResult(
  error: string,
  lang: AppLanguageCode,
  reconciled: boolean
): { ok: false; error: string; displayMessage: string } {
  return {
    ok: false,
    error,
    displayMessage:
      error === "invalid_transition" && reconciled
        ? formatOwnerOrderPatchErrAfterReconcile(lang)
        : formatOwnerOrderPatchErr(error, lang),
  };
}

export async function runOwnerStoreOrderPatch(
  storeId: string,
  orderId: string,
  body: { order_status: string; estimated_prep_minutes?: number },
  lang: AppLanguageCode,
  callbacks: OwnerStoreOrderMutationCallbacks
): Promise<OwnerStoreOrderMutationResult> {
  return runSingleFlight(mutationFlightKey(storeId, orderId, "patch"), async () => {
    const res = await patchOwnerStoreOrderStatus(storeId, orderId, body);
    if (res.ok) {
      const now = new Date().toISOString();
      callbacks.onPatchOrderRow(orderId, {
        order_status: res.order_status,
        updated_at: now,
      });
      return { ok: true, order_status: res.order_status };
    }
    if (res.error === "invalid_transition") {
      const reconciled = await reconcileOrderRowFromDetail(storeId, orderId, callbacks);
      return failureResult(res.error, lang, reconciled);
    }
    return failureResult(res.error, lang, false);
  });
}

export async function runOwnerStoreOrderCancelRequest(
  storeId: string,
  orderId: string,
  body: { reason: string; detail_reason?: string },
  lang: AppLanguageCode,
  callbacks: OwnerStoreOrderMutationCallbacks
): Promise<OwnerStoreOrderMutationResult> {
  return runSingleFlight(mutationFlightKey(storeId, orderId, "cancel"), async () => {
    const res = await postOwnerStoreOrderCancelRequest(storeId, orderId, body);
    if (res.ok) {
      const status =
        typeof res.order_status === "string" && res.order_status.trim()
          ? res.order_status.trim()
          : "cancelled";
      const now = new Date().toISOString();
      callbacks.onPatchOrderRow(orderId, {
        order_status: status,
        updated_at: now,
      });
      return { ok: true, order_status: status };
    }
    if (res.error === "invalid_transition" || res.error === "cancel_not_allowed_for_status") {
      const reconciled = await reconcileOrderRowFromDetail(storeId, orderId, callbacks);
      return failureResult(res.error, lang, reconciled);
    }
    return failureResult(res.error, lang, false);
  });
}
