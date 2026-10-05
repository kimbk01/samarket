/**
 * SCHEDULED COLLECTION (cron): verify never-checked sources, then collect due boards into the inbox.
 * Collection only — publishing is always an operator action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BoardCollectResult, collectBoardToInbox } from "./collect";
import { crawlDelaySeconds, loadRobotsPolicy } from "./robots";
import { COLLECTABLE_VERDICTS, loadManagedSources, type ManagedBoard, type ManagedSource, tryLockBoard } from "./source-store";
import { type SourceVerifyOutcome, verifyStoredSource } from "./verify";

export const COLLECT_INTERVAL_MINUTES = 60;
/** Boards failing this many times in a row back off to every 6 hours. */
export const FAILURE_BACKOFF_THRESHOLD = 3;

export type SchedulerRun = {
  startedAt: string;
  elapsedMs: number;
  verified: Array<Pick<SourceVerifyOutcome, "sourceId" | "verdict" | "robotsStatus"> & { boards: Array<{ boardId: string; verdict: string }> }>;
  collected: Array<Omit<BoardCollectResult, "latestSourceAt">>;
  skippedLocked: number;
  due: number;
};

/** Is this board due for collection at `now`? (pure; unit-tested) */
export function isBoardDue(
  board: Pick<ManagedBoard, "collectEnabled" | "enabled"> & { status: Pick<ManagedBoard["status"], "lastCheckedAt" | "consecutiveFailures"> },
  now: number,
  intervalMinutes = COLLECT_INTERVAL_MINUTES,
): boolean {
  if (!board.enabled || !board.collectEnabled) return false;
  const last = board.status.lastCheckedAt ? Date.parse(board.status.lastCheckedAt) : NaN;
  if (Number.isNaN(last)) return true;
  const minutes = board.status.consecutiveFailures >= FAILURE_BACKOFF_THRESHOLD ? intervalMinutes * 6 : intervalMinutes;
  return now - last >= minutes * 60_000;
}

export function dueBoards(sources: ManagedSource[], now: number): Array<{ source: ManagedSource; board: ManagedBoard }> {
  const out: Array<{ source: ManagedSource; board: ManagedBoard }> = [];
  for (const s of sources) {
    if (!s.enabled || !COLLECTABLE_VERDICTS.has(s.verification)) continue;
    for (const b of s.boards) if (isBoardDue(b, now)) out.push({ source: s, board: b });
  }
  // Oldest first so no board starves.
  return out.sort((a, b) => (Date.parse(a.board.status.lastCheckedAt || "") || 0) - (Date.parse(b.board.status.lastCheckedAt || "") || 0));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runScheduledCollection(
  sb: SupabaseClient,
  opts: { budgetMs?: number; verifyLimit?: number } = {},
): Promise<SchedulerRun> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const run: SchedulerRun = { startedAt: new Date(t0).toISOString(), elapsedMs: 0, verified: [], collected: [], skippedLocked: 0, due: 0 };
  const sources = await loadManagedSources(sb);

  // 1) Server-side verification of sources nobody has checked yet (bounded per run).
  const unchecked = sources
    .filter((s) => s.enabled && s.verification === "NOT_PROVEN" && !s.status.lastCheckedAt)
    .slice(0, Math.max(0, opts.verifyLimit ?? 1));
  for (const s of unchecked) {
    if (Date.now() - t0 > budget * 0.6) break;
    try {
      const v = await verifyStoredSource(sb, s, { maxBoards: 4, budgetMs: Math.min(30_000, budget * 0.6) });
      run.verified.push({ sourceId: v.sourceId, verdict: v.verdict, robotsStatus: v.robotsStatus, boards: v.boards.map((b) => ({ boardId: b.boardId, verdict: b.verdict })) });
    } catch (e) {
      run.verified.push({ sourceId: s.id, verdict: "FAILED", robotsStatus: "error", boards: [{ boardId: "*", verdict: e instanceof Error ? e.message : "error" }] });
    }
  }

  // 2) Collect due boards (inbox only), politely per host.
  const due = dueBoards(sources, Date.now());
  run.due = due.length;
  const lastHit = new Map<string, number>();
  for (const { source, board } of due) {
    if (Date.now() - t0 > budget) break;
    const host = new URL(source.baseUrl).host;
    const policy = await loadRobotsPolicy(new URL(source.baseUrl).origin);
    const delayMs = Math.min(10, Math.max(1, crawlDelaySeconds(policy.groups) ?? 1)) * 1000;
    const wait = (lastHit.get(host) ?? 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    if (!(await tryLockBoard(sb, source.id, board.boardId, 120))) {
      run.skippedLocked++;
      continue;
    }
    const res = await collectBoardToInbox(sb, source, board, { pages: 1, maxItems: 40 });
    lastHit.set(host, Date.now());
    const { rows: _rows, latestSourceAt: _l, ...summary } = res;
    void _rows;
    void _l;
    run.collected.push(summary);
  }
  run.elapsedMs = Date.now() - t0;
  return run;
}
