/**
 * BUNDLE 4 — 계정 전환 격리 회귀 (P0-2 탭 메모리·거래 초안 소유자, P2-9 메신저 캐시 viewer/epoch,
 * P2-10b bfcache guard, P2-5 logout-all 이후 lazy 재등록 차단).
 * @see docs/dibay-auth-full-audit-ssot-design-2026-10-21.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindAuthUserId,
  clearBoundAuthUserId,
  detectAuthUserMismatch,
  detectTabAuthUserSwitch,
  rememberTabAuthenticatedUserId,
  resetTabAuthenticatedUserIdForTests,
} from "@/lib/auth/client-instance-id";
import {
  buildTradeWriteFormSessionDraft,
  readTradeWriteFormPersistedDraft,
  readTradeWriteFormSessionDraft,
  writeTradeWriteFormSessionDraft,
  type TradeWriteFormSessionDraftBuildArgs,
} from "@/lib/posts/trade-write-form-session-draft";
import {
  bumpMessengerBootstrapCacheAuthEpoch,
  clearBootstrapCache,
  getMessengerBootstrapCacheAuthEpoch,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapFull,
  peekMessengerBootstrapMinimal,
  primeMessengerBootstrapCritical,
  primeMessengerBootstrapFull,
  primeMessengerBootstrapMinimal,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  ensureUserSessionRegistryRow,
  isTokenIssuedBeforeGlobalSignout,
} from "@/lib/auth/user-session-registry";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/types";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

let local: Storage;
let session: Storage;

beforeEach(() => {
  local = createStorage();
  session = createStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  resetTabAuthenticatedUserIdForTests();
  clearBootstrapCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("P0-2 per-tab authenticated user memory", () => {
  it("detects A→B in a tab even after another tab rewrote the bound id to B", () => {
    rememberTabAuthenticatedUserId("user-a");
    bindAuthUserId("user-a");
    // 다른 탭: A 로그아웃(bound 삭제) → B 로그인(bound=B)
    clearBoundAuthUserId();
    bindAuthUserId("user-b");
    expect(detectAuthUserMismatch("user-b")).toBe(false);
    expect(detectTabAuthUserSwitch("user-b")).toBe(true);
    expect(detectTabAuthUserSwitch("user-a")).toBe(false);
  });

  it("first authentication in a tab is not a switch", () => {
    expect(detectTabAuthUserSwitch("user-b")).toBe(false);
  });
});

function draftArgs(categoryId: string): TradeWriteFormSessionDraftBuildArgs {
  return {
    categoryId,
    skinKey: "general",
    title: "A 의 초안",
    description: "",
    price: "",
    region: "",
    city: "",
    images: [],
    isFreeShare: false,
    isPriceOfferEnabled: false,
    isDirectDeal: true,
    tradeTopicChildId: "",
    neighborhood: "",
    buildingName: "",
    estateType: "",
    dealType: "임대",
    deposit: "",
    monthly: "",
    managementFee: "",
    hasPremium: false,
    areaSqm: "",
    roomCount: "",
    bathroomCount: "",
    moveInDate: "",
    carModel: "",
    carYear: "",
    mileage: "",
    usedCarTrade: null,
    carHasAccident: false,
    salary: "",
    workPlace: "",
    workType: "",
    currency: "",
    exchangeRate: "",
    tradeChatCallPolicy: "none",
    descriptionAppend: "",
  };
}

describe("P0-2 trade write draft owner", () => {
  it("owner can read own draft; another account cannot (session + local)", () => {
    bindAuthUserId("user-a");
    writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(draftArgs("cat1")));
    expect(readTradeWriteFormSessionDraft("cat1")?.title).toBe("A 의 초안");
    expect(readTradeWriteFormSessionDraft("cat1")?.ownerUserId).toBe("user-a");

    bindAuthUserId("user-b");
    expect(readTradeWriteFormSessionDraft("cat1")).toBeNull();
    expect(readTradeWriteFormPersistedDraft("cat1")).toBeNull();
  });

  it("drafts with unknown owner (legacy) or no signed-in owner are ignored", () => {
    bindAuthUserId("user-a");
    session.setItem(
      "samarket:trade-write-form:v1:cat2",
      JSON.stringify({ ...buildTradeWriteFormSessionDraft(draftArgs("cat2")) }),
    );
    expect(readTradeWriteFormSessionDraft("cat2")).toBeNull();

    writeTradeWriteFormSessionDraft(buildTradeWriteFormSessionDraft(draftArgs("cat3")));
    clearBoundAuthUserId();
    expect(readTradeWriteFormPersistedDraft("cat3")).toBeNull();
  });
});

function boot(viewerId: string | null): CommunityMessengerBootstrap {
  return { me: viewerId ? { id: viewerId } : null, chats: [], groups: [] } as unknown as CommunityMessengerBootstrap;
}

function crit(viewerId: string): CommunityMessengerBootstrapCritical {
  return { tier: "critical", me: { id: viewerId } } as unknown as CommunityMessengerBootstrapCritical;
}

describe("P2-9 messenger bootstrap cache viewer id + auth epoch", () => {
  it("peek returns null when entry viewer differs from explicit or bound viewer", () => {
    bindAuthUserId("user-a");
    primeMessengerBootstrapFull(boot("user-a"));
    primeMessengerBootstrapMinimal(boot("user-a"));
    primeMessengerBootstrapCritical(crit("user-a"));
    expect(peekMessengerBootstrapFull()).not.toBeNull();
    expect(peekMessengerBootstrapFull("user-a")).not.toBeNull();
    expect(peekMessengerBootstrapFull("user-b")).toBeNull();
    expect(peekMessengerBootstrapMinimal("user-b")).toBeNull();
    expect(peekMessengerBootstrapCritical("user-b")).toBeNull();

    // 계정 전환 — bound B 에서 A 엔트리(메모리·sessionStorage 모두) 불가
    bindAuthUserId("user-b");
    expect(peekMessengerBootstrapFull()).toBeNull();
    expect(peekMessengerBootstrapCritical()).toBeNull();
  });

  it("sessionStorage entry carries viewer id and is rejected for another viewer after reload", () => {
    bindAuthUserId("user-a");
    primeMessengerBootstrapFull(boot("user-a"));
    const raw = session.getItem("samarket.messenger.bootstrap.v1");
    expect(JSON.parse(raw!).viewerId).toBe("user-a");
    // 메모리 소실(새로고침) 시뮬레이션: 저장 엔트리를 보존하고 메모리만 비우기 위해 다시 쓴다
    clearBootstrapCache();
    session.setItem("samarket.messenger.bootstrap.v1", raw!);
    expect(peekMessengerBootstrapFull("user-b")).toBeNull();
    expect(peekMessengerBootstrapFull("user-a")).not.toBeNull();
  });

  it("late write from a request started before logout (epoch bump) is dropped", () => {
    bindAuthUserId("user-a");
    const epochAtStart = getMessengerBootstrapCacheAuthEpoch();
    bumpMessengerBootstrapCacheAuthEpoch(); // explicit logout start
    primeMessengerBootstrapFull(boot("user-a"), { authEpoch: epochAtStart });
    primeMessengerBootstrapCritical(crit("user-a"), { authEpoch: epochAtStart });
    primeMessengerBootstrapMinimal(boot("user-a"), { authEpoch: epochAtStart });
    expect(peekMessengerBootstrapFull()).toBeNull();
    expect(peekMessengerBootstrapCritical()).toBeNull();
    expect(peekMessengerBootstrapMinimal()).toBeNull();
    expect(session.getItem("samarket.messenger.bootstrap.v1")).toBeNull();
  });

  it("clearBootstrapCache({authExit}) bumps epoch; payload of a different viewer than bound is not written", () => {
    const before = getMessengerBootstrapCacheAuthEpoch();
    clearBootstrapCache({ authExit: true });
    expect(getMessengerBootstrapCacheAuthEpoch()).toBe(before + 1);

    bindAuthUserId("user-b");
    primeMessengerBootstrapFull(boot("user-a"));
    expect(peekMessengerBootstrapFull("user-a")).toBeNull();
    expect(session.getItem("samarket.messenger.bootstrap.v1")).toBeNull();
  });
});

describe("P2-10b post-logout bfcache guard clears only on authenticated boot", () => {
  it("anonymous boot ready keeps guard; authenticated ready clears", async () => {
    const store = await import("@/lib/app-boot/app-boot-store");
    const { shouldClearPostLogoutGuardOnBootReady } = await import(
      "@/components/auth/PostLogoutBfcacheGuard"
    );
    store.setAppBootAnonymous();
    expect(shouldClearPostLogoutGuardOnBootReady()).toBe(false);
    store.setAppBootProfile({ id: "user-b" } as never, "ready");
    expect(shouldClearPostLogoutGuardOnBootReady()).toBe(true);
    store.resetAppBootStore();
  });
});

function makeRegistrySb(opts: {
  sessionRow: unknown;
  globalSignoutAt: string | null;
  globalLookupError?: unknown;
}) {
  const upsert = vi.fn(async () => ({ error: null }));
  let sessionLookups = 0;
  const from = vi.fn(() => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    });
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => {
      if (filters.invalidation_reason === "global_signout") {
        if (opts.globalLookupError) return { data: null, error: opts.globalLookupError };
        return {
          data: opts.globalSignoutAt ? { invalidated_at: opts.globalSignoutAt } : null,
          error: null,
        };
      }
      sessionLookups += 1;
      if (sessionLookups === 1) return { data: opts.sessionRow, error: null };
      return { data: { active: true, invalidation_reason: null }, error: null };
    });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return { select: vi.fn(() => chain), update: vi.fn(() => chain), upsert };
  });
  return { sb: { from } as never, upsert };
}

describe("P2-5 logout-all: tokens issued before global_signout cannot lazily register", () => {
  const signoutAt = "2026-10-21T10:00:00.000Z";
  const signoutSec = Date.parse(signoutAt) / 1000;

  it("old token (iat before logout-all) + unknown session cookie → rejected, no upsert", async () => {
    const { sb, upsert } = makeRegistrySb({ sessionRow: null, globalSignoutAt: signoutAt });
    await expect(
      ensureUserSessionRegistryRow(sb, "u1", "new-cookie-uuid", {
        globalSignoutGuard: { tokenIssuedAtSec: signoutSec - 60 },
      }),
    ).resolves.toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fresh token (iat after logout-all) keeps multi-device lazy registration", async () => {
    const { sb, upsert } = makeRegistrySb({ sessionRow: null, globalSignoutAt: signoutAt });
    await expect(
      ensureUserSessionRegistryRow(sb, "u1", "s-new", {
        globalSignoutGuard: { tokenIssuedAtSec: signoutSec + 60 },
      }),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("no global_signout history → lazy registration even when iat unknown", async () => {
    const { sb, upsert } = makeRegistrySb({ sessionRow: null, globalSignoutAt: null });
    await expect(
      ensureUserSessionRegistryRow(sb, "u1", "s-new", { globalSignoutGuard: { tokenIssuedAtSec: null } }),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("iat unknown or lookup failure with global_signout history → fail-closed", async () => {
    const a = makeRegistrySb({ sessionRow: null, globalSignoutAt: signoutAt });
    await expect(isTokenIssuedBeforeGlobalSignout(a.sb, "u1", null)).resolves.toBe(true);
    const b = makeRegistrySb({
      sessionRow: null,
      globalSignoutAt: null,
      globalLookupError: { code: "57014", message: "timeout" },
    });
    await expect(
      ensureUserSessionRegistryRow(b.sb, "u1", "s-new", {
        globalSignoutGuard: { tokenIssuedAtSec: signoutSec + 60 },
      }),
    ).resolves.toBe(false);
    expect(b.upsert).not.toHaveBeenCalled();
  });
});
