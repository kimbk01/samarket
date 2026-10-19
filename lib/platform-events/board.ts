/**
 * Event board (/events) — pure list contract shared by `GET /api/platform-events` and tests.
 *
 * Public board shows only published, non-archived events that have started:
 * - ongoing: started and not ended (ends_at null or ≥ now)
 * - ended:   ended within the last {@link PLATFORM_EVENT_BOARD_ENDED_WINDOW_DAYS} days
 * Scheduled (not started), draft/unpublished (private) and archived events never appear.
 *
 * Order: is_pinned desc → sort_order asc → start desc → id (stable keyset cursor).
 */
import { buildPlatformEventDetailPath, type PlatformEventRow } from "@/lib/platform-events/types";

export const PLATFORM_EVENT_BOARD_STATES = ["ongoing", "ended"] as const;
export type PlatformEventBoardState = (typeof PLATFORM_EVENT_BOARD_STATES)[number];

export const PLATFORM_EVENT_BOARD_ENDED_WINDOW_DAYS = 30;
export const PLATFORM_EVENT_BOARD_PAGE_SIZE = 12;
export const PLATFORM_EVENT_BOARD_MAX_PAGE_SIZE = 30;
/** Upper bound of candidate rows read per request (board is curated, not a feed). */
export const PLATFORM_EVENT_BOARD_CANDIDATE_LIMIT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePlatformEventBoardState(raw: unknown): PlatformEventBoardState {
  return String(raw ?? "").trim().toLowerCase() === "ended" ? "ended" : "ongoing";
}

export function clampPlatformEventBoardLimit(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return PLATFORM_EVENT_BOARD_PAGE_SIZE;
  return Math.min(n, PLATFORM_EVENT_BOARD_MAX_PAGE_SIZE);
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
}

export type PlatformEventBoardRowInput = Pick<
  PlatformEventRow,
  | "id"
  | "status"
  | "startsAt"
  | "endsAt"
  | "publishedAt"
  | "createdAt"
  | "archivedAt"
  | "isPinned"
  | "sortOrder"
>;

/** Which board tab a row belongs to, or null when it must not be listed. */
export function classifyPlatformEventBoardState(
  row: Partial<PlatformEventBoardRowInput> | null | undefined,
  nowMs: number = Date.now()
): PlatformEventBoardState | null {
  if (!row) return null;
  if (String(row.status ?? "").trim().toLowerCase() !== "published") return null;
  if (row.archivedAt) return null;
  const start = ms(row.startsAt);
  if (start != null && start > nowMs) return null; // scheduled
  const end = ms(row.endsAt);
  if (end == null || end >= nowMs) return "ongoing";
  if (end >= nowMs - PLATFORM_EVENT_BOARD_ENDED_WINDOW_DAYS * DAY_MS) return "ended";
  return null;
}

/** DB pre-filter bounds (the pure classifier re-applies them as the SSOT). */
export function platformEventBoardDbWindow(nowMs: number = Date.now()): {
  nowIso: string;
  endedSinceIso: string;
} {
  return {
    nowIso: new Date(nowMs).toISOString(),
    endedSinceIso: new Date(nowMs - PLATFORM_EVENT_BOARD_ENDED_WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

type SortKey = { pinned: 0 | 1; sortOrder: number; startMs: number; id: string };

function sortKeyOf(row: Partial<PlatformEventBoardRowInput> & { id: string }): SortKey {
  return {
    pinned: row.isPinned ? 1 : 0,
    sortOrder: Number.isFinite(row.sortOrder) ? Math.trunc(row.sortOrder as number) : 0,
    startMs: ms(row.startsAt) ?? ms(row.publishedAt) ?? ms(row.createdAt) ?? 0,
    id: String(row.id),
  };
}

/** Negative when a comes first. */
function compareKeys(a: SortKey, b: SortKey): number {
  if (a.pinned !== b.pinned) return b.pinned - a.pinned;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.startMs !== b.startMs) return b.startMs - a.startMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function comparePlatformEventBoardRows(
  a: Partial<PlatformEventBoardRowInput> & { id: string },
  b: Partial<PlatformEventBoardRowInput> & { id: string }
): number {
  return compareKeys(sortKeyOf(a), sortKeyOf(b));
}

export function encodePlatformEventBoardCursor(
  row: Partial<PlatformEventBoardRowInput> & { id: string }
): string {
  const k = sortKeyOf(row);
  return `${k.pinned}_${k.sortOrder}_${k.startMs}_${k.id}`;
}

export function decodePlatformEventBoardCursor(raw: unknown): SortKey | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 200) return null;
  const parts = s.split("_");
  if (parts.length < 4) return null;
  const [p, so, st] = parts;
  const id = parts.slice(3).join("_");
  if (p !== "0" && p !== "1") return null;
  if (!/^-?\d+$/.test(so) || !/^-?\d+$/.test(st) || !id) return null;
  return { pinned: p === "1" ? 1 : 0, sortOrder: Number(so), startMs: Number(st), id };
}

export type PlatformEventBoardItem = {
  id: string;
  title: string;
  href: string;
  /** 2:1 card image — thumbnail, else hero. */
  thumbnailUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isPinned: boolean;
  category: string | null;
  state: PlatformEventBoardState;
  /** Ongoing only: "D-3", "D-DAY"; null when no end date or ended. */
  dday: string | null;
};

const MANILA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDayIndex(t: number): number {
  const ymd = MANILA_DATE.format(new Date(t)); // YYYY-MM-DD
  return Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

/** Calendar-day D-day in Asia/Manila. */
export function computePlatformEventDday(
  endsAt: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  const end = ms(endsAt);
  if (end == null || end < nowMs) return null;
  const days = calendarDayIndex(end) - calendarDayIndex(nowMs);
  return days <= 0 ? "D-DAY" : `D-${days}`;
}

function httpsOrNull(u: string | null | undefined): string | null {
  const s = String(u ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

export function toPlatformEventBoardItem(
  row: PlatformEventRow,
  state: PlatformEventBoardState,
  nowMs: number = Date.now()
): PlatformEventBoardItem {
  return {
    id: row.id,
    title: row.title,
    href: buildPlatformEventDetailPath(row.id),
    thumbnailUrl: httpsOrNull(row.thumbnailUrl) ?? httpsOrNull(row.heroImageUrl),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isPinned: row.isPinned === true,
    category: row.category ?? null,
    state,
    dday: state === "ongoing" ? computePlatformEventDday(row.endsAt, nowMs) : null,
  };
}

export function paginatePlatformEventBoard(
  rows: readonly PlatformEventRow[],
  opts: { state: PlatformEventBoardState; cursor?: string | null; limit?: number; nowMs?: number }
): { items: PlatformEventBoardItem[]; nextCursor: string | null } {
  const nowMs = opts.nowMs ?? Date.now();
  const limit = clampPlatformEventBoardLimit(opts.limit);
  const after = decodePlatformEventBoardCursor(opts.cursor);
  const eligible = rows
    .filter((r) => classifyPlatformEventBoardState(r, nowMs) === opts.state)
    .sort(comparePlatformEventBoardRows);
  const rest = after ? eligible.filter((r) => compareKeys(sortKeyOf(r), after) > 0) : eligible;
  const page = rest.slice(0, limit);
  const nextCursor =
    rest.length > limit && page.length > 0
      ? encodePlatformEventBoardCursor(page[page.length - 1])
      : null;
  return {
    items: page.map((r) => toPlatformEventBoardItem(r, opts.state, nowMs)),
    nextCursor,
  };
}

/** Event period label (Asia/Manila) — board card + Event Detail. */
export function formatPlatformEventPeriod(startsAt: string | null, endsAt: string | null, language: "ko" | "en"): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString(language === "en" ? "en-PH" : "ko-KR", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  const a = startsAt ? fmt(startsAt) : "";
  const b = endsAt ? fmt(endsAt) : "";
  if (a && b) return `${a} – ${b}`;
  if (a) return language === "en" ? `From ${a}` : `${a}부터`;
  if (b) return language === "en" ? `Until ${b}` : `${b}까지`;
  return "";
}
