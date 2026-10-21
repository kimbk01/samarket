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

/**
 * IA-19: 실패 문서는 앱 CSS 를 로드하지 않는 독립 문서라 `--sam-*` 토큰을 인라인으로 정의한다
 * (값은 `app/design-tokens.css` 라이트·다크와 동일). 레이아웃은 카드 1장 최소 셸.
 */
const OWNER_ORDER_CHAT_ENSURE_DOCUMENT_TOKEN_CSS =
  ":root{color-scheme:light dark;--sam-bg-app:#FFFCFC;--sam-bg-surface:#FFFFFF;--sam-text-primary:#362415;--sam-text-secondary:#604C4C;--sam-border-default:rgba(54,36,21,0.14);--sam-primary:#0B421A;--sam-radius-sm:4px}" +
  "@media (prefers-color-scheme:dark){:root{--sam-bg-app:#12161d;--sam-bg-surface:#1a2029;--sam-text-primary:#eef2f7;--sam-text-secondary:#b3bfd1;--sam-border-default:#2d3747;--sam-primary:#4FBA6E}}" +
  "body{margin:0;font-family:system-ui,sans-serif;background:var(--sam-bg-app);color:var(--sam-text-primary)}" +
  ".sam-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}" +
  ".sam-card{width:100%;max-width:360px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;text-align:center;font-size:14px;line-height:1.5;background:var(--sam-bg-surface);border:1px solid var(--sam-border-default);border-radius:var(--sam-radius-sm)}" +
  ".sam-card p{margin:0}.sam-card a{color:var(--sam-primary);font-weight:600}";

function htmlPage(body: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>DIBAY</title><style>${OWNER_ORDER_CHAT_ENSURE_DOCUMENT_TOKEN_CSS}</style></head><body><div class="sam-shell"><div class="sam-card">${body}</div></div></body></html>`;
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
