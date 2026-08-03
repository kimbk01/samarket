/**
 * Phase 3-1 — Bell Explain Matrix (Runtime).
 *
 * Phase B: `total` = NotificationAttentionTotal (distinct non-chat attention_key).
 * Chat message kinds stay in kind buckets for quarantine audit — not in digit.
 *
 * DO NOT: Badge room rewrite · Heal · Legacy delete · digit hacks
 *
 * Product kinds (Header Bell / Inbox presentation):
 *   general | group | tradeMessage | customerOrder | ownerOrder |
 *   tradeStatus | orderStatus | missedCall | systemAdmin | marketing
 */
import {
  resolveBellPresentationType,
  type BellPresentationType,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";
import { buildNotificationAttentionProjection } from "@/lib/notifications/chat-notification-attention-projection";

export const BELL_EXPLAIN_MATRIX_AUTHORITY = "bell_explain_v1" as const;

/** Product Explain kinds (team lead Phase 3-1 table). */
export type BellExplainKindId =
  | "generalMessage"
  | "groupMessage"
  | "tradeMessage"
  | "customerOrder"
  | "ownerOrder"
  | "tradeStatus"
  | "orderStatus"
  | "missedCall"
  | "systemAdmin"
  | "marketing";

export type BellExplainPart = Readonly<{
  count: number;
  eventIds: readonly string[];
}>;

export type BellExplainMatrix = Readonly<{
  authority: typeof BELL_EXPLAIN_MATRIX_AUTHORITY;
  total: number;
  generalMessage: BellExplainPart;
  groupMessage: BellExplainPart;
  tradeMessage: BellExplainPart;
  customerOrder: BellExplainPart;
  ownerOrder: BellExplainPart;
  tradeStatus: BellExplainPart;
  orderStatus: BellExplainPart;
  missedCall: BellExplainPart;
  systemAdmin: BellExplainPart;
  marketing: BellExplainPart;
  /** Events that are unread but excluded from Bell digit (test / signal). */
  excludedFromDigit: BellExplainPart;
}>;

export type BellExplainEventRow = Readonly<{
  id: string;
  type?: string | null;
  category?: string | null;
  display_payload?: unknown;
  room_id?: string | null;
  dedupe_key?: string | null;
  unread?: boolean | null;
  read_at?: string | null;
  muted_snapshot?: boolean | null;
}>;

const DIGIT_EXCLUDED_TYPES = new Set([
  "admin_test",
  "incoming_call_signal",
  "incoming_call",
]);

function uniqIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function emptyPart(): BellExplainPart {
  return { count: 0, eventIds: [] };
}

function partFromIds(ids: readonly string[]): BellExplainPart {
  const eventIds = uniqIds(ids);
  return { count: eventIds.length, eventIds };
}

/**
 * Map Inbox presentation → Phase 3-1 product Explain kind.
 * customer/owner order_status + delivery_status → orderStatus (one product line).
 */
export function bellPresentationToExplainKind(
  presentation: BellPresentationType
): BellExplainKindId | "excluded" {
  switch (presentation) {
    case "general_message":
      return "generalMessage";
    case "group_message":
      return "groupMessage";
    case "trade_message":
      return "tradeMessage";
    case "customer_order_message":
      return "customerOrder";
    case "owner_order_message":
      return "ownerOrder";
    case "trade_status":
      return "tradeStatus";
    case "order_status":
    case "customer_order_status":
    case "owner_order_status":
    case "delivery_status":
      return "orderStatus";
    case "missed_call":
      return "missedCall";
    case "admin_notice":
    case "system_important":
      return "systemAdmin";
    case "admin_marketing":
      return "marketing";
    case "unsupported":
      return "excluded";
    default:
      return "excluded";
  }
}

export function isBellDigitEligibleEvent(row: BellExplainEventRow): boolean {
  const type = String(row.type ?? "").trim();
  if (DIGIT_EXCLUDED_TYPES.has(type)) return false;
  if (row.unread === false) return false;
  if (row.read_at != null && String(row.read_at).trim() !== "") return false;
  if (!isNotificationEventBadgeEligible(row)) return false;
  return true;
}

/**
 * Pure builder — Explain Matrix from unread event rows (same eligibility as Bell digit).
 */
export function buildBellExplainMatrix(rows: readonly BellExplainEventRow[]): BellExplainMatrix {
  const buckets: Record<BellExplainKindId | "excluded", string[]> = {
    generalMessage: [],
    groupMessage: [],
    tradeMessage: [],
    customerOrder: [],
    ownerOrder: [],
    tradeStatus: [],
    orderStatus: [],
    missedCall: [],
    systemAdmin: [],
    marketing: [],
    excluded: [],
  };

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (!isBellDigitEligibleEvent(row)) {
      const type = String(row.type ?? "").trim();
      if (DIGIT_EXCLUDED_TYPES.has(type) || row.unread !== false) {
        // only track explicitly excluded digit types among unread rows
        if (
          row.unread !== false &&
          (row.read_at == null || String(row.read_at).trim() === "") &&
          DIGIT_EXCLUDED_TYPES.has(type)
        ) {
          buckets.excluded.push(id);
        }
      }
      continue;
    }
    const source: NotificationEventInboxSource = {
      id,
      type: (row.type ?? "chat_message") as NotificationEventInboxSource["type"],
      category: (row.category ?? "system") as NotificationEventInboxSource["category"],
      title: "",
      body: "",
      display_payload:
        row.display_payload && typeof row.display_payload === "object"
          ? (row.display_payload as Record<string, unknown>)
          : null,
      read_at: row.read_at ?? null,
      created_at: "",
      dedupe_key: String(row.dedupe_key ?? id),
      room_id: row.room_id ?? null,
    };
    const presentation = resolveBellPresentationType(source);
    const kind = bellPresentationToExplainKind(presentation);
    if (kind === "excluded") {
      buckets.excluded.push(id);
      continue;
    }
    buckets[kind].push(id);
  }

  const generalMessage = partFromIds(buckets.generalMessage);
  const groupMessage = partFromIds(buckets.groupMessage);
  const tradeMessage = partFromIds(buckets.tradeMessage);
  const customerOrder = partFromIds(buckets.customerOrder);
  const ownerOrder = partFromIds(buckets.ownerOrder);
  const tradeStatus = partFromIds(buckets.tradeStatus);
  const orderStatus = partFromIds(buckets.orderStatus);
  const missedCall = partFromIds(buckets.missedCall);
  const systemAdmin = partFromIds(buckets.systemAdmin);
  const marketing = partFromIds(buckets.marketing);

  const notification = buildNotificationAttentionProjection(rows);
  const excludedIds = uniqIds([
    ...buckets.excluded,
    ...notification.excludedChatMessageEventIds,
    ...notification.excludedRoomBoundMissedCallEventIds,
  ]);

  return {
    authority: BELL_EXPLAIN_MATRIX_AUTHORITY,
    /** Phase B digit = NotificationAttentionTotal (not chat event SUM). */
    total: notification.total,
    generalMessage,
    groupMessage,
    tradeMessage,
    customerOrder,
    ownerOrder,
    tradeStatus,
    orderStatus,
    missedCall,
    systemAdmin,
    marketing,
    excludedFromDigit: partFromIds(excludedIds),
  };
}

export function assertBellExplainMatrix(
  matrix: BellExplainMatrix,
  opts?: { expectedBellTotal?: number; requireEventIds?: boolean }
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (matrix.authority !== BELL_EXPLAIN_MATRIX_AUTHORITY) {
    errors.push("authority_mismatch");
  }
  // Phase B: total = NotificationAttention (key distinct), not sum of kind event buckets.
  // Chat kind buckets are quarantine/diagnostics and must not force total.
  const nonChatEventSum =
    matrix.tradeStatus.count +
    matrix.orderStatus.count +
    matrix.missedCall.count +
    matrix.systemAdmin.count +
    matrix.marketing.count;
  if (matrix.total > nonChatEventSum + matrix.excludedFromDigit.count) {
    // soft: total should not exceed eligible non-chat events (+ excluded audit)
  }
  if (opts?.expectedBellTotal != null && matrix.total !== opts.expectedBellTotal) {
    errors.push(`total!=bellTotal (${matrix.total}!=${opts.expectedBellTotal})`);
  }
  if (opts?.requireEventIds !== false) {
    const parts: BellExplainPart[] = [
      matrix.generalMessage,
      matrix.groupMessage,
      matrix.tradeMessage,
      matrix.customerOrder,
      matrix.ownerOrder,
      matrix.tradeStatus,
      matrix.orderStatus,
      matrix.missedCall,
      matrix.systemAdmin,
      matrix.marketing,
    ];
    for (const p of parts) {
      if (p.count !== p.eventIds.length) {
        errors.push(`count!=eventIds (${p.count}!=${p.eventIds.length})`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function listBellExplainEventIds(matrix: BellExplainMatrix): readonly string[] {
  return uniqIds([
    ...matrix.generalMessage.eventIds,
    ...matrix.groupMessage.eventIds,
    ...matrix.tradeMessage.eventIds,
    ...matrix.customerOrder.eventIds,
    ...matrix.ownerOrder.eventIds,
    ...matrix.tradeStatus.eventIds,
    ...matrix.orderStatus.eventIds,
    ...matrix.missedCall.eventIds,
    ...matrix.systemAdmin.eventIds,
    ...matrix.marketing.eventIds,
  ]);
}

export { emptyPart };
