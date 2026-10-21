export type GroupMediaIndexItem = {
  messageId: string;
  messageType: "image" | "file";
  content: string;
  createdAt: string;
  senderId: string | null;
  metadata: Record<string, unknown>;
};

export type GroupMediaIndexPage = {
  items: GroupMediaIndexItem[];
  nextCursor: string | null;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** S-2: 커서는 PostgREST `.or()` 문자열에 들어가므로 형식을 엄격히 제한한다 (ISO timestamp | uuid). */
const GROUP_MEDIA_CURSOR_ISO_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;
const GROUP_MEDIA_CURSOR_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GroupMediaCursorParse =
  | { ok: true; cursor: { createdAt: string; messageId: string } | null }
  | { ok: false };

/** 빈 커서 → `{ ok: true, cursor: null }`, 형식 위반 → `{ ok: false }` (라우트 400). */
export function parseGroupMediaCursorStrict(value: unknown): GroupMediaCursorParse {
  if (value == null) return { ok: true, cursor: null };
  if (typeof value !== "string") return { ok: false };
  const raw = value.trim();
  if (!raw) return { ok: true, cursor: null };
  const sep = raw.indexOf("|");
  if (sep <= 0) return { ok: false };
  const createdAt = raw.slice(0, sep).trim();
  const messageId = raw.slice(sep + 1).trim();
  if (!GROUP_MEDIA_CURSOR_ISO_RE.test(createdAt)) return { ok: false };
  if (!Number.isFinite(Date.parse(createdAt))) return { ok: false };
  if (!GROUP_MEDIA_CURSOR_UUID_RE.test(messageId)) return { ok: false };
  return { ok: true, cursor: { createdAt, messageId } };
}

export function parseGroupMediaCursor(value: unknown): { createdAt: string; messageId: string } | null {
  const parsed = parseGroupMediaCursorStrict(value);
  return parsed.ok ? parsed.cursor : null;
}

export function encodeGroupMediaCursor(createdAt: string, messageId: string): string {
  return `${createdAt}|${messageId}`;
}

/**
 * A-1: 관리자 숨김·모두에게서 삭제·삭제(soft)·뷰어가 숨긴 메시지는 앨범에서 제외한다 (쿼리 필터의 2차 방어).
 */
export function filterGroupMediaRows(
  rows: Array<Record<string, unknown>>,
  filter: "all" | "image" | "file",
  options?: { hiddenMessageIds?: ReadonlySet<string> | null }
): GroupMediaIndexItem[] {
  const hidden = options?.hiddenMessageIds ?? null;
  return rows
    .filter(
      (row) =>
        row.is_hidden_by_admin !== true &&
        !trimText(row.deleted_for_everyone_at) &&
        !trimText(row.deleted_at) &&
        !(hidden && hidden.has(trimText(row.id)))
    )
    .map((row) => ({
      messageId: trimText(row.id),
      messageType: trimText(row.message_type) as "image" | "file",
      content: trimText(row.content),
      createdAt: trimText(row.created_at),
      senderId: typeof row.sender_id === "string" ? row.sender_id : null,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {},
    }))
    .filter(
      (row) =>
        row.messageId &&
        row.createdAt &&
        (filter === "all"
          ? row.messageType === "image" || row.messageType === "file"
          : row.messageType === filter)
    );
}
