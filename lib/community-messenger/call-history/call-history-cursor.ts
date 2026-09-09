/**
 * CUT-2B — opaque call-history keyset cursor (`started_at` + `id`).
 * Not an ended_at / session cursor.
 */

export const COMMUNITY_MESSENGER_CALL_LOGS_PAGE_SIZE = 30;
export const COMMUNITY_MESSENGER_CALL_LOGS_FETCH_SIZE = COMMUNITY_MESSENGER_CALL_LOGS_PAGE_SIZE + 1;

export type CommunityMessengerCallHistoryCursor = {
  startedAt: string;
  id: string;
};

const CURSOR_KEYS = new Set(["startedAt", "id"]);

function isValidCursorTimestamp(raw: string): boolean {
  const t = Date.parse(raw);
  return Number.isFinite(t);
}

function isValidCursorId(raw: string): boolean {
  if (!raw || raw.length > 80) return false;
  // UUID preferred; non-uuid allowed for local/dev fixtures only (non-empty printable).
  return /^[0-9a-fA-F-]{8,64}$|^[A-Za-z0-9_.:-]{1,80}$/.test(raw);
}

/** PostgREST filter value quoting for timestamps with `:`. */
export function quotePostgrestLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function encodeCommunityMessengerCallHistoryCursor(
  cursor: CommunityMessengerCallHistoryCursor
): string {
  return Buffer.from(
    JSON.stringify({ startedAt: cursor.startedAt, id: cursor.id }),
    "utf8"
  ).toString("base64url");
}

/**
 * Decode opaque cursor. Empty/missing → null (first page).
 * Malformed / invalid shape → `{ error: "invalid_cursor" }` (HTTP 400 — do not restart page 1).
 */
export function decodeCommunityMessengerCallHistoryCursor(
  raw: string | null | undefined
):
  | { ok: true; cursor: CommunityMessengerCallHistoryCursor | null }
  | { ok: false; error: "invalid_cursor" } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, cursor: null };
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "invalid_cursor" };
    }
    const keys = Object.keys(parsed);
    if (keys.length !== 2 || keys.some((k) => !CURSOR_KEYS.has(k))) {
      return { ok: false, error: "invalid_cursor" };
    }
    const startedAt = typeof parsed.startedAt === "string" ? parsed.startedAt.trim() : "";
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    if (!startedAt || !id) return { ok: false, error: "invalid_cursor" };
    if (!isValidCursorTimestamp(startedAt) || !isValidCursorId(id)) {
      return { ok: false, error: "invalid_cursor" };
    }
    return { ok: true, cursor: { startedAt, id } };
  } catch {
    return { ok: false, error: "invalid_cursor" };
  }
}

/** DESC keyset: strictly older than cursor. */
export function isCallHistoryRowStrictlyOlderThanCursor(
  startedAt: string,
  id: string,
  cursor: CommunityMessengerCallHistoryCursor
): boolean {
  if (startedAt < cursor.startedAt) return true;
  if (startedAt === cursor.startedAt && id < cursor.id) return true;
  return false;
}

export function compareCallHistoryKeysetDesc(
  aStartedAt: string,
  aId: string,
  bStartedAt: string,
  bId: string
): number {
  if (aStartedAt !== bStartedAt) return bStartedAt.localeCompare(aStartedAt);
  return bId.localeCompare(aId);
}
