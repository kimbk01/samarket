/**
 * VIEW CONTRACT
 *
 * - Do NOT invent crawler-specific organic_views writer.
 * - Community SSOT: community_posts.view_count + record_community_post_view.
 * - On publish: pick initial_view_seed ONCE from Admin min/max; store for audit;
 *   set community_posts.view_count = initial_view_seed in the same transaction.
 * - Later reads: display view_count (seed + subsequent organic via existing RPC).
 */

export type BoardImportViewSeedPolicy = {
  min: number;
  max: number;
};

export function pickInitialViewSeed(
  policy: BoardImportViewSeedPolicy,
  random: () => number = Math.random
): number {
  const min = Math.max(0, Math.floor(policy.min));
  const max = Math.max(min, Math.floor(policy.max));
  if (max === min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

export type BoardImportViewPublishPlan = {
  initial_view_seed: number;
  /** Value to write into community_posts.view_count at publish. */
  community_posts_view_count_initial: number;
};
