/**
 * general_direct 읽기 전용 CachePort — in-memory / test adapter.
 * namespace: chat.general.*  Persistent legacy sessionStorage writer 금지.
 */
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem } from "@/lib/messenger/general-direct/types";

const NS = "chat.general";

export type GeneralDirectCacheKey = Readonly<{
  viewerUserId: string;
  generation: string;
}>;

function assertGeneralNamespace(key: string): void {
  if (!key.startsWith(`${NS}.`)) {
    throw new Error(`dibay_general_direct_cache_namespace_forbidden:${key}`);
  }
  if (key.startsWith("chat.group.") || key.startsWith("chat.trade.") || key.startsWith("chat.store_order.")) {
    throw new Error("dibay_general_direct_foreign_cache_forbidden");
  }
}

export function buildGeneralDirectCacheKey(input: GeneralDirectCacheKey): string {
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim() || "0";
  if (!viewer) throw new Error("dibay_general_direct_cache_viewer_required");
  const key = `${NS}.snapshot.v1:${viewer}:${GENERAL_DIRECT_DOMAIN}:${generation}`;
  assertGeneralNamespace(key);
  return key;
}

/** Phase 2: in-memory only. 프로세스 밖 persistent writer 없음. */
export class GeneralDirectReadonlyMemoryCache {
  readonly domain = GENERAL_DIRECT_DOMAIN;
  readonly namespacePrefix = NS;
  readonly readOnlyUntilCutover = true as const;

  private store = new Map<string, ReadonlyArray<GeneralDirectListItem>>();

  /** 테스트 fixture 주입 — production sessionStorage 아님 */
  seedForTest(key: string, rows: ReadonlyArray<GeneralDirectListItem>): void {
    assertGeneralNamespace(key);
    this.store.set(key, rows);
  }

  read(key: string): ReadonlyArray<GeneralDirectListItem> | null {
    assertGeneralNamespace(key);
    return this.store.get(key) ?? null;
  }

  /** cutover 전 production write 금지 */
  writeForbidden(): never {
    throw new Error("dibay_general_direct_cache_write_forbidden_until_phase6");
  }

  clearForTest(): void {
    this.store.clear();
  }
}

export const generalDirectMemoryCache = new GeneralDirectReadonlyMemoryCache();
