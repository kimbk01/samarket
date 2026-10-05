/**
 * Re-verify a stored source: robots + every enabled board sampled (list + one real detail).
 * Writes the per-board verdict and the source verdict; never enables collection by itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardUrl } from "./adapters/common";
import { type BoardSample, sampleBoard } from "./detect";
import { isPathAllowed, loadRobotsPolicy } from "./robots";
import { BOARDS_TABLE, type ManagedSource, SOURCES_TABLE } from "./source-store";

export type SourceVerifyOutcome = {
  sourceId: string;
  verdict: "FULL" | "PARTIAL" | "BLOCKED" | "FAILED";
  robotsStatus: string;
  boards: Array<{ boardId: string; verdict: string; sample: BoardSample | null; robotsAllowed: boolean }>;
  elapsedMs: number;
};

/** Source verdict from board verdicts: best working board wins; all blocked → BLOCKED. */
export function combineBoardVerdicts(verdicts: string[]): SourceVerifyOutcome["verdict"] {
  if (verdicts.includes("FULL")) return "FULL";
  if (verdicts.includes("PARTIAL")) return "PARTIAL";
  if (verdicts.length && verdicts.every((v) => v === "BLOCKED")) return "BLOCKED";
  return "FAILED";
}

export async function verifyStoredSource(
  sb: SupabaseClient,
  source: ManagedSource,
  opts: { maxBoards?: number; budgetMs?: number } = {},
): Promise<SourceVerifyOutcome> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const origin = new URL(source.baseUrl).origin;
  const robots = await loadRobotsPolicy(origin);
  const boards = source.boards.filter((b) => b.enabled).slice(0, Math.max(1, opts.maxBoards ?? 8));
  const out: SourceVerifyOutcome["boards"] = [];
  const now = new Date().toISOString();

  for (const board of boards) {
    if (Date.now() - t0 > budget) break;
    const url = new URL(boardUrl(source, board));
    const robotsAllowed = isPathAllowed(robots.groups, url.pathname + url.search);
    const sample = robotsAllowed ? await sampleBoard({ source }, board) : null;
    const verdict = robotsAllowed ? sample!.verdict : "BLOCKED";
    out.push({ boardId: board.boardId, verdict, sample, robotsAllowed });
    const ok = verdict === "FULL" || verdict === "PARTIAL";
    await sb
      .from(BOARDS_TABLE)
      .update({
        last_checked_at: now,
        last_verdict: verdict,
        latest_source_at: sample?.latestAt ?? null,
        last_error:
          verdict === "FULL" ? null : (sample?.reasons.join(", ") || (robotsAllowed ? verdict : "robots_disallowed")).slice(0, 500),
        ...(ok ? { last_success_at: now, consecutive_failures: 0 } : { last_failure_at: now, consecutive_failures: board.status.consecutiveFailures + 1 }),
        // A board that stopped working is taken out of scheduled collection (operator re-enables).
        ...(ok ? {} : { collect_enabled: false }),
        updated_at: now,
      })
      .eq("source_id", source.id)
      .eq("board_id", board.boardId);
  }

  const verdict = combineBoardVerdicts(out.map((b) => b.verdict));
  const ok = verdict === "FULL" || verdict === "PARTIAL";
  await sb
    .from(SOURCES_TABLE)
    .update({
      verification: verdict,
      robots_status: robots.status,
      ai_bots_blocked: robots.aiBotsBlocked,
      last_checked_at: now,
      verify_json: { checkedAt: now, boards: out, by: "verifyStoredSource" },
      reason: out.map((b) => `${b.boardId}:${b.verdict}`).join(" ").slice(0, 500),
      ...(ok
        ? { last_success_at: now, consecutive_failures: 0, last_error: null }
        : {
            last_failure_at: now,
            consecutive_failures: source.status.consecutiveFailures + 1,
            last_error: out.map((b) => `${b.boardId}: ${b.sample?.reasons.join(", ") || b.verdict}`).join(" | ").slice(0, 500),
          }),
      ...(verdict === "BLOCKED" ? { enabled: false } : {}),
      updated_at: now,
    })
    .eq("id", source.id);

  return { sourceId: source.id, verdict, robotsStatus: robots.status, boards: out, elapsedMs: Date.now() - t0 };
}
