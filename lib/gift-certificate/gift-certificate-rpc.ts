/**
 * G3 — thin service-role RPC wrappers for Paid Gift Certificate money mutations.
 * Callers must pass a service-role Supabase client (tryGetSupabaseForStores / tryCreateSupabaseServiceClient).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_RPCS } from "@/lib/gift-certificate/gift-certificate-schema";

export type GiftRpcOk = { ok: true; data: Record<string, unknown> };
export type GiftRpcErr = {
  ok: false;
  error: string;
  data?: Record<string, unknown>;
};
export type GiftRpcResult = GiftRpcOk | GiftRpcErr;

export function parseGiftRpcJson(
  data: unknown,
  rpcError: { message: string } | null | undefined
): GiftRpcResult {
  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }
  const row =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  if (row.ok === false) {
    return { ok: false, error: String(row.error ?? "rpc_failed"), data: row };
  }
  return { ok: true, data: row };
}

async function callGiftRpc(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<GiftRpcResult> {
  const { data, error } = await sb.rpc(fn, args);
  return parseGiftRpcJson(data, error);
}

export function giftCertificatePurchase(
  sb: SupabaseClient,
  args: { buyerUserId: string; productId: string; idempotencyKey: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.purchase, {
    p_buyer_user_id: args.buyerUserId,
    p_product_id: args.productId,
    p_idempotency_key: args.idempotencyKey,
  });
}

export function giftCertificateOffer(
  sb: SupabaseClient,
  args: {
    senderUserId: string;
    instanceId: string;
    recipientUserId: string;
    roomId: string | null;
    idempotencyKey: string;
  }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.offer, {
    p_sender_user_id: args.senderUserId,
    p_instance_id: args.instanceId,
    p_recipient_user_id: args.recipientUserId,
    p_room_id: args.roomId,
    p_idempotency_key: args.idempotencyKey,
  });
}

export function giftCertificateAccept(
  sb: SupabaseClient,
  args: { recipientUserId: string; transferId: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.accept, {
    p_recipient_user_id: args.recipientUserId,
    p_transfer_id: args.transferId,
  });
}

export function giftCertificateReject(
  sb: SupabaseClient,
  args: { recipientUserId: string; transferId: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.reject, {
    p_recipient_user_id: args.recipientUserId,
    p_transfer_id: args.transferId,
  });
}

export function giftCertificateCancel(
  sb: SupabaseClient,
  args: { senderUserId: string; transferId: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.cancel, {
    p_sender_user_id: args.senderUserId,
    p_transfer_id: args.transferId,
  });
}

export function giftCertificateRedeem(
  sb: SupabaseClient,
  args: {
    buyerUserId: string;
    orderId: string;
    storeId: string;
    redemptions: { instance_id: string; amount: number }[];
    idempotencyKey: string;
  }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.redeem, {
    p_buyer_user_id: args.buyerUserId,
    p_order_id: args.orderId,
    p_store_id: args.storeId,
    p_redemptions: args.redemptions,
    p_idempotency_key: args.idempotencyKey,
  });
}

export function giftCertificateRedemptionReverse(
  sb: SupabaseClient,
  args: { orderId: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.redemptionReverse, {
    p_order_id: args.orderId,
  });
}

export function giftCertificateRefundOrderAtomic(
  sb: SupabaseClient,
  args: { orderId: string; actorUserId?: string | null }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.refundOrderAtomic, {
    p_order_id: args.orderId,
    p_actor_user_id: args.actorUserId ?? null,
  });
}

export function giftCertificateConversionRequest(
  sb: SupabaseClient,
  args: {
    ownerUserId: string;
    storeId: string;
    amount: number;
    idempotencyKey: string;
  }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.conversionRequest, {
    p_owner_user_id: args.ownerUserId,
    p_store_id: args.storeId,
    p_amount: args.amount,
    p_idempotency_key: args.idempotencyKey,
  });
}

export function giftCertificateConversionApprove(
  sb: SupabaseClient,
  args: { adminUserId: string; requestId: string }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.conversionApprove, {
    p_admin_user_id: args.adminUserId,
    p_request_id: args.requestId,
  });
}

export function storeCashRecoveryClear(
  sb: SupabaseClient,
  args: { adminUserId: string; obligationId: string; amount: number }
): Promise<GiftRpcResult> {
  return callGiftRpc(sb, GIFT_RPCS.recoveryClear, {
    p_admin_user_id: args.adminUserId,
    p_obligation_id: args.obligationId,
    p_amount: args.amount,
  });
}
