/**
 * CUT-SSOT-2 — TOPIC graph context for search relevance (SIM-BOTH).
 * Primary authority: category id + parent_id graph — not label-only search.
 */

export type SearchTopicGraphNode = {
  id: string;
  parent_id: string;
  name: string;
  name_en?: string | null;
  slug: string;
};

export type SearchTopicGraphContext = {
  rootParentIds: string[];
  /** Query matched these TOPIC (child) category ids */
  matchedTopicCategoryIds: string[];
  /** Same parent_id as a matched topic, excluding matched */
  siblingTopicCategoryIds: string[];
};

function normalizeTopicGraphText(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function emptySearchTopicGraphContext(rootParentIds: string[] = []): SearchTopicGraphContext {
  return {
    rootParentIds,
    matchedTopicCategoryIds: [],
    siblingTopicCategoryIds: [],
  };
}

function nodeLabels(node: SearchTopicGraphNode): string[] {
  return [
    normalizeTopicGraphText(node.name),
    normalizeTopicGraphText(node.name_en),
    normalizeTopicGraphText(node.slug),
  ].filter((s) => s.length >= 2);
}

/**
 * Match q against TOPIC nodes under known roots. Label/slug match is a **discovery**
 * signal to bind query intent to category ids — listing relevance uses id graph.
 */
export function resolveSearchTopicGraphContext(
  q: string | null | undefined,
  topicNodes: SearchTopicGraphNode[],
  rootParentIds: string[]
): SearchTopicGraphContext | null {
  const phrase = normalizeTopicGraphText(q);
  if (!phrase || topicNodes.length === 0) return null;

  const tokens = phrase.split(" ").filter((t) => t.length >= 2);
  const matched = new Set<string>();

  for (const node of topicNodes) {
    const labels = nodeLabels(node);
    const phraseHit = labels.some((label) => label.length >= 2 && phrase.includes(label));
    const tokenHit =
      tokens.length > 0 &&
      tokens.some((token) =>
        labels.some((label) => label === token || (token.length >= 3 && label.includes(token)))
      );
    if (phraseHit || tokenHit) matched.add(node.id);
  }

  if (matched.size === 0) return null;

  const siblings = new Set<string>();
  for (const node of topicNodes) {
    if (matched.has(node.id)) continue;
    for (const mid of matched) {
      const mnode = topicNodes.find((n) => n.id === mid);
      if (mnode && mnode.parent_id === node.parent_id) {
        siblings.add(node.id);
      }
    }
  }

  return {
    rootParentIds: [...rootParentIds],
    matchedTopicCategoryIds: [...matched],
    siblingTopicCategoryIds: [...siblings],
  };
}

export function listingMatchesTopicGraphExact(
  listingCategoryId: string | null | undefined,
  ctx: SearchTopicGraphContext | null | undefined
): boolean {
  const cid = listingCategoryId?.trim() ?? "";
  if (!cid || !ctx) return false;
  return ctx.matchedTopicCategoryIds.includes(cid);
}

export function listingMatchesTopicGraphSibling(
  listingCategoryId: string | null | undefined,
  ctx: SearchTopicGraphContext | null | undefined
): boolean {
  const cid = listingCategoryId?.trim() ?? "";
  if (!cid || !ctx) return false;
  return ctx.siblingTopicCategoryIds.includes(cid);
}
