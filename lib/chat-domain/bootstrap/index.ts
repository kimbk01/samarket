/**
 * Phase D — Domain list bootstrap contracts (stubs).
 * DO NOT: type-split mixed CM home API into fake Domain lists (plan §6 D).
 * DO NOT: wire applyHomeListPatch / hub / bell here (Phase H).
 * Real Domain queries cut over after migration+backfill and dedicated RPCs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDomain, StoreOrderRole } from "@/lib/chat-domain/four-domain-freeze";
import type {
  DomainListBootstrapResult,
  DomainListItemDto,
} from "@/lib/chat-domain/list/domain-list-dto";

export type DomainListBootstrapRequest = {
  userId: string;
  sb?: SupabaseClient<any> | null;
  /** Soft cap — stubs ignore until wired. */
  limit?: number;
};

const NOT_WIRED = (chatDomain: ChatDomain): DomainListBootstrapResult => ({
  status: "not_wired",
  chatDomain,
  items: [],
  error: "phase_d_domain_bootstrap_not_wired",
});

function mapDomainRows(
  chatDomain: ChatDomain,
  rows: Array<{
    id?: unknown;
    domain_identity?: unknown;
    chat_domain?: unknown;
    last_message?: unknown;
    last_message_at?: unknown;
    title?: unknown;
    unread_count?: unknown;
    store_order_role?: unknown;
  }>,
): DomainListItemDto[] {
  const out: DomainListItemDto[] = [];
  for (const row of rows) {
    const roomId = typeof row.id === "string" ? row.id.trim() : "";
    const domainIdentity =
      typeof row.domain_identity === "string" ? row.domain_identity.trim() : "";
    if (!roomId || !domainIdentity) continue;
    if (row.chat_domain != null && row.chat_domain !== chatDomain) continue;
    const roleRaw = typeof row.store_order_role === "string" ? row.store_order_role.trim() : "";
    const storeOrderRole: StoreOrderRole | null =
      roleRaw === "customer" || roleRaw === "owner" ? roleRaw : null;
    out.push({
      roomId,
      chatDomain,
      domainIdentity,
      storeOrderRole,
      unreadCount: Math.max(0, Number(row.unread_count ?? 0) || 0),
      lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : null,
      title: typeof row.title === "string" ? row.title : "",
      lastMessagePreview: typeof row.last_message === "string" ? row.last_message : null,
    });
  }
  return out;
}

/**
 * Query by chat_domain when columns exist. Returns migration_pending on missing column.
 * Not product-wired — safe to call from tests / future API.
 */
export async function tryLoadDomainListByChatDomain(
  sb: SupabaseClient<any>,
  userId: string,
  chatDomain: ChatDomain,
  limit = 100,
): Promise<DomainListBootstrapResult> {
  const uid = userId.trim();
  if (!uid) {
    return { status: "error", chatDomain, items: [], error: "missing_user" };
  }
  try {
    const { data: parts, error: pErr } = await sb
      .from("community_messenger_participants")
      .select("room_id, unread_count, store_order_role")
      .eq("user_id", uid)
      .is("left_at", null)
      .limit(Math.max(1, Math.min(limit * 4, 800)));
    if (pErr) {
      const msg = String(pErr.message ?? pErr);
      if (/store_order_role|chat_domain|domain_identity|column/i.test(msg)) {
        return { status: "migration_pending", chatDomain, items: [], error: msg };
      }
      return { status: "error", chatDomain, items: [], error: msg };
    }
    const partRows = (parts ?? []) as Array<{
      room_id?: string;
      unread_count?: number | null;
      store_order_role?: string | null;
    }>;
    const roomIds = partRows.map((p) => String(p.room_id ?? "").trim()).filter(Boolean);
    if (roomIds.length === 0) {
      return { status: "ok", chatDomain, items: [] };
    }
    const unreadByRoom = new Map(
      partRows.map((p) => [String(p.room_id ?? ""), Number(p.unread_count ?? 0) || 0]),
    );
    const roleByRoom = new Map(
      partRows.map((p) => [String(p.room_id ?? ""), p.store_order_role ?? null]),
    );

    const { data: rooms, error: rErr } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, domain_identity, title, last_message, last_message_at")
      .eq("chat_domain", chatDomain)
      .in("id", roomIds.slice(0, Math.max(1, limit)))
      .order("last_message_at", { ascending: false });
    if (rErr) {
      const msg = String(rErr.message ?? rErr);
      if (/chat_domain|domain_identity|column/i.test(msg)) {
        return { status: "migration_pending", chatDomain, items: [], error: msg };
      }
      return { status: "error", chatDomain, items: [], error: msg };
    }
    const mapped = mapDomainRows(
      chatDomain,
      ((rooms ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        unread_count: unreadByRoom.get(String(row.id ?? "")) ?? 0,
        store_order_role: roleByRoom.get(String(row.id ?? "")) ?? null,
      })),
    );
    return { status: "ok", chatDomain, items: mapped };
  } catch (e) {
    return {
      status: "error",
      chatDomain,
      items: [],
      error: e instanceof Error ? e.message : "domain_list_failed",
    };
  }
}

/** Product-facing stubs — not wired to home Surface (Phase H). */
export async function loadGeneralDirectListBootstrap(
  _req: DomainListBootstrapRequest,
): Promise<DomainListBootstrapResult> {
  return NOT_WIRED("general_direct");
}

export async function loadGroupListBootstrap(
  _req: DomainListBootstrapRequest,
): Promise<DomainListBootstrapResult> {
  return NOT_WIRED("group");
}

export async function loadTradeListBootstrap(
  _req: DomainListBootstrapRequest,
): Promise<DomainListBootstrapResult> {
  return NOT_WIRED("trade");
}

export async function loadStoreOrderListBootstrap(
  _req: DomainListBootstrapRequest,
): Promise<DomainListBootstrapResult> {
  return NOT_WIRED("store_order");
}
