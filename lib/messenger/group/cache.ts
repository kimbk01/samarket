/**
 * group CachePort — chat.group.* read-only / in-memory.
 */
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";

const NS = "chat.group";

export function buildGroupCacheKey(input: { viewerUserId: string; generation: string }): string {
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim() || "0";
  if (!viewer) throw new Error("dibay_group_cache_viewer_required");
  const key = `${NS}.snapshot.v1:${viewer}:${GROUP_DOMAIN}:${generation}`;
  assertGroupCacheNamespace(key);
  return key;
}

function assertGroupCacheNamespace(key: string): void {
  if (!key.startsWith(`${NS}.`)) throw new Error(`dibay_group_cache_namespace_forbidden:${key}`);
  if (
    key.startsWith("chat.general.") ||
    key.startsWith("chat.trade.") ||
    key.startsWith("chat.store_order.")
  ) {
    throw new Error("dibay_group_foreign_cache_forbidden");
  }
}

export class GroupReadonlyMemoryCache {
  readonly domain = GROUP_DOMAIN;
  readonly namespacePrefix = NS;
  readonly readOnlyUntilCutover = true as const;
  private store = new Map<string, ReadonlyArray<GroupListItem>>();

  seedForTest(key: string, rows: ReadonlyArray<GroupListItem>): void {
    assertGroupCacheNamespace(key);
    this.store.set(key, rows);
  }

  read(key: string): ReadonlyArray<GroupListItem> | null {
    assertGroupCacheNamespace(key);
    return this.store.get(key) ?? null;
  }

  writeForbidden(): never {
    throw new Error("dibay_group_cache_write_forbidden_until_phase6");
  }

  clearForTest(): void {
    this.store.clear();
  }
}

export const groupMemoryCache = new GroupReadonlyMemoryCache();
