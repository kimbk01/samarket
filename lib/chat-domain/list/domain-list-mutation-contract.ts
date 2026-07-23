/**
 * Telegram-style list mutation contract — field ownership + violation logs.
 * Surface reducers must call these before applying row patches.
 */

export type DomainListMutationType =
  | "MARK_READ"
  | "PARTICIPANT_UNREAD"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "METADATA_HYDRATE"
  | "SERVER_FETCH_MERGE";

export type DomainListSurface = "hub_gd_group" | "trade" | "store_order";

const UNREAD_ONLY = new Set(["unreadCount"]);
const MESSAGE_FIELDS = new Set(["previewText", "lastMessage", "lastMessageAt", "lastMessageType", "unreadCount"]);
const SENT_FIELDS = new Set(["previewText", "lastMessage", "lastMessageAt", "lastMessageType"]);
const META_FIELDS = new Set([
  "title",
  "avatarUrl",
  "productTitle",
  "productImageUrl",
  "storeName",
  "storeImageUrl",
  "peerLabel",
  "statusBadge",
]);

export function allowedFieldsForListMutation(type: DomainListMutationType): ReadonlySet<string> {
  switch (type) {
    case "MARK_READ":
    case "PARTICIPANT_UNREAD":
      return UNREAD_ONLY;
    case "MESSAGE_RECEIVED":
      return MESSAGE_FIELDS;
    case "MESSAGE_SENT":
      return SENT_FIELDS;
    case "METADATA_HYDRATE":
      return META_FIELDS;
    case "SERVER_FETCH_MERGE":
      return new Set([...MESSAGE_FIELDS, ...META_FIELDS, "unreadCount"]);
    default:
      return new Set();
  }
}

export function assertListMutationFields(args: {
  type: DomainListMutationType;
  changedFields: readonly string[];
  surface: DomainListSurface;
  roomId?: string;
}): void {
  const allowed = allowedFieldsForListMutation(args.type);
  for (const f of args.changedFields) {
    if (allowed.has(f)) continue;
    if (
      (args.type === "MARK_READ" || args.type === "PARTICIPANT_UNREAD") &&
      (f === "previewText" || f === "lastMessage" || f === "lastMessageAt")
    ) {
      logListAuthorityViolation("PREVIEW_WRITE_FROM_UNREAD_EVENT", {
        surface: args.surface,
        roomId: args.roomId,
        mutationType: args.type,
        field: f,
      });
    }
  }
}

export function isServerLastMessageAtStale(storeAt: string | null | undefined, serverAt: string | null | undefined): boolean {
  const a = Date.parse(String(storeAt ?? ""));
  const b = Date.parse(String(serverAt ?? ""));
  if (!Number.isFinite(b)) return true;
  if (!Number.isFinite(a)) return false;
  return b < a;
}

export type ListAuthorityViolationCode =
  | "ROOM_RETURN_FETCH_ATTEMPT"
  | "MULTI_WRITER_DETECTED"
  | "FULL_LIST_REPLACE_ON_RETURN"
  | "PREVIEW_WRITE_FROM_UNREAD_EVENT"
  | "STALE_SERVER_PREVIEW_OVERWRITE"
  | "DOMAIN_ROW_LEAK"
  | "DUPLICATE_EVENT_APPLIED";

export function logListAuthorityViolation(
  code: ListAuthorityViolationCode,
  extra?: Record<string, unknown>
): void {
  if (typeof console === "undefined") return;
  // eslint-disable-next-line no-console -- list authority QA / CDP
  console.warn(`[telegram-list-authority] ${code}`, extra ?? {});
}

export function logListAuthorityMutation(payload: {
  surface: DomainListSurface;
  roomId: string;
  mutationType: DomainListMutationType;
  changedFields: readonly string[];
  listOrderChanged: boolean;
  fetchReason?: string | null;
  writerName: string;
  previousLastMessageAt?: string | null;
  nextLastMessageAt?: string | null;
  eventVersion?: string | number | null;
}): void {
  if (typeof console === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TELEGRAM_LIST_AUTHORITY_LOG !== "1") {
    return;
  }
  // eslint-disable-next-line no-console -- list authority QA
  console.info("[telegram-list-authority:mutation]", payload);
}
