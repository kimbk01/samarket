import type { ExternalBoardArticleRow, ExternalBoardSourceRow } from "@/lib/external-board-import/types";

export type ChronologyCase = "A" | "B" | "C";

export type ChronologyResolveInput = {
  source: ExternalBoardSourceRow;
  article: ExternalBoardArticleRow;
  /** CASE B: verified sequence index (0 = newest). Required with board_sequence_verified. */
  sequenceIndex?: number | null;
  /** CASE B: batch materialization base time (usually now). */
  sequenceBaseNow?: Date;
  /** AUTO vs MANUAL — CASE C AUTO is always blocked. */
  mode: "MANUAL" | "AUTO";
};

export type ChronologyResolveResult =
  | { ok: true; case: ChronologyCase; publishedAtIso: string }
  | {
      ok: false;
      case: ChronologyCase;
      failureCode: string;
      failureMessage: string;
    };

/**
 * Owner FINAL chronology contract.
 * Publisher must never invent discovery-order / random / all-now / implicit now for UNKNOWN.
 */
export function resolveExternalBoardPublishedAt(input: ChronologyResolveInput): ChronologyResolveResult {
  const sourceDate = String(input.article.source_published_at ?? "").trim();
  if (sourceDate) {
    const t = Date.parse(sourceDate);
    if (!Number.isNaN(t)) {
      return { ok: true, case: "A", publishedAtIso: new Date(t).toISOString() };
    }
  }

  if (input.source.board_sequence_verified) {
    const idx = input.sequenceIndex;
    if (idx == null || idx < 0 || !Number.isFinite(idx)) {
      return {
        ok: false,
        case: "B",
        failureCode: "sequence_index_required",
        failureMessage: "Verified board sequence requires an explicit sequence index for published_at.",
      };
    }
    const base = input.sequenceBaseNow ?? new Date();
    // Preserve newest→oldest: index 0 newest, later indices older by 1s steps (deterministic).
    const published = new Date(base.getTime() - idx * 1000);
    return { ok: true, case: "B", publishedAtIso: published.toISOString() };
  }

  // CASE C — UNKNOWN
  if (input.mode === "AUTO") {
    return {
      ok: false,
      case: "C",
      failureCode: "chronology_unknown_auto_blocked",
      failureMessage: "CHRONOLOGY_UNKNOWN: AUTO publish is blocked.",
    };
  }

  const operatorAt = String(input.article.operator_published_at ?? "").trim();
  if (!operatorAt) {
    return {
      ok: false,
      case: "C",
      failureCode: "operator_published_at_required",
      failureMessage:
        "CHRONOLOGY_UNKNOWN: MANUAL publish requires explicit operator published_at (or batch order+time policy).",
    };
  }
  const ot = Date.parse(operatorAt);
  if (Number.isNaN(ot)) {
    return {
      ok: false,
      case: "C",
      failureCode: "operator_published_at_invalid",
      failureMessage: "operator_published_at is not a valid timestamp.",
    };
  }
  return { ok: true, case: "C", publishedAtIso: new Date(ot).toISOString() };
}

/** View seed may use configured window; not public chronology. */
export function computeViewSeed(source: ExternalBoardSourceRow): number {
  const min = Math.max(0, Number(source.view_seed_min ?? 100));
  const max = Math.max(min, Number(source.view_seed_max ?? 500));
  return min + Math.floor(Math.random() * (max - min + 1));
}
