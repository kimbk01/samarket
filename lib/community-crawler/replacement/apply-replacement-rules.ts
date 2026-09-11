/**
 * V2-2 exact-string replacement engine (ONE authority).
 *
 * Preferred precedence: board-scoped wins over source-scoped.
 * Application order (documented):
 * 1) source-scoped rules (board_id null) first,
 * 2) board-scoped rules after (more specific; later wins on overlap),
 * each ordered by: priority ASC → created_at ASC → id ASC.
 *
 * No regex / AI / fuzzy / render-time / publish-time logic.
 */

export type CommunityCrawlReplacementRuleLike = {
  id: string;
  source_id: string;
  board_id: string | null;
  from_text: string;
  to_text: string;
  apply_title: boolean;
  apply_body: boolean;
  priority: number;
  enabled: boolean;
  created_at: string;
};

/** Stable sort: source-scoped first, then board-scoped; priority/created_at/id. */
export function sortCommunityCrawlReplacementRulesForApply(
  rules: CommunityCrawlReplacementRuleLike[]
): CommunityCrawlReplacementRuleLike[] {
  return [...rules].sort((a, b) => {
    const aBoard = a.board_id ? 1 : 0;
    const bBoard = b.board_id ? 1 : 0;
    if (aBoard !== bBoard) return aBoard - bBoard;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ac = a.created_at.localeCompare(b.created_at);
    if (ac !== 0) return ac;
    return a.id.localeCompare(b.id);
  });
}

/** Exact substring replace (all occurrences). Not regex. */
export function replaceExactAll(haystack: string, fromText: string, toText: string): string {
  if (!fromText) return haystack;
  if (!haystack.includes(fromText)) return haystack;
  return haystack.split(fromText).join(toText);
}

export function applyCommunityCrawlReplacementRules(input: {
  sourceTitle: string;
  sourceBody: string;
  rules: CommunityCrawlReplacementRuleLike[];
}): { dibay_title: string; dibay_body: string } {
  const ordered = sortCommunityCrawlReplacementRulesForApply(
    input.rules.filter((r) => r.enabled)
  );
  let title = input.sourceTitle;
  let body = input.sourceBody;
  for (const rule of ordered) {
    if (rule.apply_title) {
      title = replaceExactAll(title, rule.from_text, rule.to_text);
    }
    if (rule.apply_body) {
      body = replaceExactAll(body, rule.from_text, rule.to_text);
    }
  }
  return { dibay_title: title, dibay_body: body };
}

/** Preview uses the SAME engine as REAL application. */
export function previewCommunityCrawlReplacement(input: {
  sampleTitle: string;
  sampleBody: string;
  rules: CommunityCrawlReplacementRuleLike[];
}): { beforeTitle: string; afterTitle: string; beforeBody: string; afterBody: string } {
  const after = applyCommunityCrawlReplacementRules({
    sourceTitle: input.sampleTitle,
    sourceBody: input.sampleBody,
    rules: input.rules,
  });
  return {
    beforeTitle: input.sampleTitle,
    afterTitle: after.dibay_title,
    beforeBody: input.sampleBody,
    afterBody: after.dibay_body,
  };
}
