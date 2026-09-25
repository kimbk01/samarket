/**
 * Trade HOME list boot — non-empty cache/RSC only may skip network.
 * Empty `posts=[]` boot is never authoritative READY_EMPTY.
 */
export function tradeHomeBootSkipsNetworkLoad(
  boot: { posts: readonly unknown[] } | null | undefined
): boolean {
  return !!boot && Array.isArray(boot.posts) && boot.posts.length > 0;
}
