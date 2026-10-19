/**
 * Event board columns (thumbnail_url, sort_order, is_pinned, category, archived_at) arrive with
 * migration 20270518120000, which is applied separately from the code deploy. Every read/write
 * that touches them goes through these helpers so the app keeps working before the migration.
 */
import {
  PLATFORM_EVENTS_SELECT,
  PLATFORM_EVENTS_SELECT_WITH_BOARD,
} from "@/lib/platform-events/types";

export const PLATFORM_EVENT_BOARD_DB_KEYS = [
  "thumbnail_url",
  "sort_order",
  "is_pinned",
  "category",
  "archived_at",
] as const;

type PgErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/** Postgres 42703 (undefined_column) or PostgREST PGRST204 (column not in schema cache). */
export function isMissingBoardColumnError(error: PgErrorLike): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  const msg = String(error.message ?? "");
  return PLATFORM_EVENT_BOARD_DB_KEYS.some((k) => msg.includes(k)) && /column/i.test(msg);
}

export function stripBoardColumns<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const k of PLATFORM_EVENT_BOARD_DB_KEYS) delete out[k];
  return out;
}

type SelectResult = { data: unknown; error: PgErrorLike };

/**
 * Run a query builder with the board-aware select; retry with the legacy select when the
 * columns do not exist yet.
 */
export async function selectPlatformEventsWithBoardFallback(
  run: (select: string) => PromiseLike<SelectResult>
): Promise<SelectResult & { boardColumns: boolean }> {
  const first = await run(PLATFORM_EVENTS_SELECT_WITH_BOARD);
  if (!first.error || !isMissingBoardColumnError(first.error)) {
    return { ...first, boardColumns: true };
  }
  const second = await run(PLATFORM_EVENTS_SELECT);
  return { ...second, boardColumns: false };
}

/**
 * Write (insert / update) with board columns; on missing-column error, retry without them.
 * `run` receives the payload and the select list to return.
 */
export async function writePlatformEventWithBoardFallback(
  payload: Record<string, unknown>,
  run: (payload: Record<string, unknown>, select: string) => PromiseLike<SelectResult>
): Promise<SelectResult & { boardColumns: boolean }> {
  const first = await run(payload, PLATFORM_EVENTS_SELECT_WITH_BOARD);
  if (!first.error || !isMissingBoardColumnError(first.error)) {
    return { ...first, boardColumns: true };
  }
  const second = await run(stripBoardColumns(payload), PLATFORM_EVENTS_SELECT);
  return { ...second, boardColumns: false };
}
