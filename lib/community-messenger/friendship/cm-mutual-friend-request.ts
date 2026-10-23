/**
 * §2 묶음 6 — mutual friend-request RPC contract (service_role).
 * Accept = single DB function txn: status accepted + both user_social_relations.friend rows.
 */

export type CmFriendRequestRpcStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type CmSendFriendRequestRpcResult =
  | { ok: true; requestId: string; status: "pending"; alreadyRequested?: boolean }
  | { ok: false; error: string; requestId?: string };

export type CmAcceptFriendRequestRpcResult =
  | {
      ok: true;
      requestId: string;
      status: "accepted";
      peerUserId: string;
      idempotent?: boolean;
    }
  | { ok: false; error: string };

export type CmRejectFriendRequestRpcResult =
  | { ok: true; requestId: string; status: "rejected"; idempotent?: boolean }
  | { ok: false; error: string };

export type CmCancelFriendRequestRpcResult =
  | { ok: true; didCancel: boolean; requestId?: string }
  | { ok: false; error: string };

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Pure parser — unit-tested without DB. */
export function parseCmSendFriendRequestRpc(raw: unknown): CmSendFriendRequestRpcResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "friend_request_send_failed" };
  if (row.ok === true) {
    const requestId = trimId(row.request_id);
    if (!requestId) return { ok: false, error: "friend_request_send_failed" };
    return {
      ok: true,
      requestId,
      status: "pending",
      alreadyRequested: row.already_requested === true,
    };
  }
  return {
    ok: false,
    error: trimId(row.error) || "friend_request_send_failed",
    requestId: trimId(row.request_id) || undefined,
  };
}

export function parseCmAcceptFriendRequestRpc(raw: unknown): CmAcceptFriendRequestRpcResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "friend_request_accept_failed" };
  if (row.ok === true) {
    const requestId = trimId(row.request_id);
    const peerUserId = trimId(row.peer_user_id);
    if (!requestId || !peerUserId) return { ok: false, error: "friend_request_accept_failed" };
    return {
      ok: true,
      requestId,
      status: "accepted",
      peerUserId,
      ...(row.idempotent === true ? { idempotent: true as const } : {}),
    };
  }
  return { ok: false, error: trimId(row.error) || "friend_request_accept_failed" };
}

export function parseCmRejectFriendRequestRpc(raw: unknown): CmRejectFriendRequestRpcResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "friend_request_reject_failed" };
  if (row.ok === true) {
    const requestId = trimId(row.request_id);
    if (!requestId) return { ok: false, error: "friend_request_reject_failed" };
    return {
      ok: true,
      requestId,
      status: "rejected",
      ...(row.idempotent === true ? { idempotent: true as const } : {}),
    };
  }
  return { ok: false, error: trimId(row.error) || "friend_request_reject_failed" };
}

export function parseCmCancelFriendRequestRpc(raw: unknown): CmCancelFriendRequestRpcResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "friend_request_cancel_failed" };
  if (row.ok === true) {
    return {
      ok: true,
      didCancel: row.did_cancel === true,
      requestId: trimId(row.request_id) || undefined,
    };
  }
  return { ok: false, error: trimId(row.error) || "friend_request_cancel_failed" };
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function rpcCmSendFriendRequest(
  sb: RpcClient,
  args: { requesterId: string; addresseeId: string; note?: string }
): Promise<CmSendFriendRequestRpcResult> {
  const { data, error } = await sb.rpc("cm_send_friend_request", {
    p_requester_id: args.requesterId,
    p_addressee_id: args.addresseeId,
    p_note: args.note ?? "",
  });
  if (error) return { ok: false, error: "friend_request_send_failed" };
  return parseCmSendFriendRequestRpc(data);
}

export async function rpcCmAcceptFriendRequest(
  sb: RpcClient,
  args: { requestId: string; actorUserId: string }
): Promise<CmAcceptFriendRequestRpcResult> {
  const { data, error } = await sb.rpc("cm_accept_friend_request", {
    p_request_id: args.requestId,
    p_actor_user_id: args.actorUserId,
  });
  if (error) return { ok: false, error: "friend_request_accept_failed" };
  return parseCmAcceptFriendRequestRpc(data);
}

export async function rpcCmRejectFriendRequest(
  sb: RpcClient,
  args: { requestId: string; actorUserId: string }
): Promise<CmRejectFriendRequestRpcResult> {
  const { data, error } = await sb.rpc("cm_reject_friend_request", {
    p_request_id: args.requestId,
    p_actor_user_id: args.actorUserId,
  });
  if (error) return { ok: false, error: "friend_request_reject_failed" };
  return parseCmRejectFriendRequestRpc(data);
}

export async function rpcCmCancelFriendRequest(
  sb: RpcClient,
  args: { requesterId: string; addresseeId: string }
): Promise<CmCancelFriendRequestRpcResult> {
  const { data, error } = await sb.rpc("cm_cancel_friend_request", {
    p_requester_id: args.requesterId,
    p_addressee_id: args.addresseeId,
  });
  if (error) return { ok: false, error: "friend_request_cancel_failed" };
  return parseCmCancelFriendRequestRpc(data);
}

/** Migration contract markers — atomic accept must upsert both friend directions then set accepted. */
export const CM_ACCEPT_FRIEND_REQUEST_ATOMIC_MARKERS = [
  "CREATE OR REPLACE FUNCTION public.cm_accept_friend_request",
  "FOR UPDATE",
  "INSERT INTO public.user_social_relations",
  "v_req.requester_id, v_req.addressee_id",
  "v_req.addressee_id, v_req.requester_id",
  "SET status = 'accepted'",
  "RAISE;",
] as const;
