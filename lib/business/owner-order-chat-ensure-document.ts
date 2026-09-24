import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { encodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import {
  MESSENGER_ROOM_RETURN_QUERY_KEY,
  sanitizeMessengerRoomReturnHref,
} from "@/lib/community-messenger/messenger-entry-origin";
import {
  ensureStoreOrderMessengerRoom,
  type StoreOrderMessengerEnsureResult,
} from "@/lib/community-messenger/store-order-chat-service";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export type OwnerOrderChatEnsureDocumentResult =
  | { kind: "redirect"; locationPathAndSearch: string }
  | { kind: "html"; status: number; html: string }
  | { kind: "not_found" };

/** Canonical Room href for owner hard-ensure (query contract SSOT). */
export function buildOwnerDeliveryOwnerRoomLocationPath(
  result: Extract<StoreOrderMessengerEnsureResult, { ok: true }>,
  orderId: string
): string {
  const roomUrl = new URL(
    `/community-messenger/rooms/${encodeURIComponent(result.roomId)}`,
    "https://samarket.local"
  );
  roomUrl.searchParams.set("from", "delivery-owner");
  roomUrl.searchParams.set("cm_list", "delivery");
  const cmCtx = encodeCommunityMessengerRoomCmCtx({
    v: 1,
    kind: "delivery",
    storeOrderId: orderId,
    orderNo: result.orderNo,
    storeId: result.storeId,
    storeDisplayName: result.storeName,
    headline: result.storeName,
  });
  roomUrl.searchParams.set("cm_ctx", cmCtx);
  const ret = sanitizeMessengerRoomReturnHref(OwnerRoutes.orderChats(result.storeId));
  if (ret) roomUrl.searchParams.set(MESSENGER_ROOM_RETURN_QUERY_KEY, ret);
  return `${roomUrl.pathname}${roomUrl.search}`;
}

function htmlPage(body: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>DIBAY</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#fff;color:#111"><div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;text-align:center;font-size:14px">${body}</div></body></html>`;
}

/**
 * Owner hard-ensure decision for HTTP document redirect (Route Handler).
 * Domain SSOT remains `ensureStoreOrderMessengerRoom` — no proxy duplication.
 */
export async function resolveOwnerOrderChatEnsureDocument(
  orderIdRaw: string
): Promise<OwnerOrderChatEnsureDocumentResult> {
  const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : "";
  const lang = resolveServerInitialLanguage({});
  if (!orderId) {
    return {
      kind: "html",
      status: 400,
      html: htmlPage(
        `<p>${escapeHtml(translate(lang, "store_order_id_required"))}</p><p><a href="/stores/owner">${escapeHtml(translate(lang, "biz_title_default"))}</a></p>`
      ),
    };
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) return { kind: "not_found" };

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return {
      kind: "html",
      status: 503,
      html: htmlPage(`<p>${escapeHtml(translate(lang, "owner_store_server_config_required"))}</p>`),
    };
  }

  const result = await ensureStoreOrderMessengerRoom(sb as SupabaseClient, {
    orderId,
    userId,
  });
  if (!result.ok) {
    return {
      kind: "html",
      status: result.status === 403 ? 403 : result.status === 404 ? 404 : 400,
      html: htmlPage(
        `<p>${escapeHtml(translate(lang, "owner_store_order_chat_load_failed"))} (${escapeHtml(result.error)})</p><p><a href="/stores/owner">${escapeHtml(translate(lang, "owner_store_admin_hub"))}</a></p>`
      ),
    };
  }

  return {
    kind: "redirect",
    locationPathAndSearch: buildOwnerDeliveryOwnerRoomLocationPath(result, orderId),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
