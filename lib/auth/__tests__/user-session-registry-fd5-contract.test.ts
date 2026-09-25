import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAuthDuplicateLoginPolicy = vi.fn();

vi.mock("@/lib/auth/session-policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session-policy")>(
    "@/lib/auth/session-policy"
  );
  return {
    ...actual,
    loadAuthDuplicateLoginPolicy: (...args: unknown[]) => loadAuthDuplicateLoginPolicy(...args),
  };
});

import {
  ensureUserSessionRegistryRow,
  inspectUserSessionRegistry,
  invalidateAllUserSessionRegistry,
  invalidateUserSessionRegistry,
  isUserSessionSchemaError,
  syncUserSessionRegistry,
  validateUserSessionRegistry,
} from "@/lib/auth/user-session-registry";
import { DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY, isDuplicateLoginConflict } from "@/lib/auth/session-policy";

function schemaError() {
  return { code: "42P01", message: 'relation "user_sessions" does not exist' };
}

function makeSb(handlers: {
  select?: () => { data: unknown; error: unknown };
  update?: (payload: unknown) => { error: unknown };
  upsert?: (payload: unknown) => { error: unknown };
}) {
  const upsert = vi.fn(async (payload: unknown) => handlers.upsert?.(payload) ?? { error: null });
  const update = vi.fn((payload: unknown) => {
    const result = () => handlers.update?.(payload) ?? { error: null };
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return chain;
  });
  const from = vi.fn(() => {
    const selectChain: Record<string, unknown> = {};
    selectChain.eq = vi.fn(() => selectChain);
    selectChain.maybeSingle = vi.fn(async () => handlers.select?.() ?? { data: null, error: null });
    selectChain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(handlers.select?.() ?? { data: null, error: null }).then(resolve, reject);
    return {
      select: vi.fn(() => selectChain),
      update,
      upsert,
    };
  });
  return { from, __update: update, __upsert: upsert } as never;
}

describe("FD5 user-session-registry contract", () => {
  beforeEach(() => {
    loadAuthDuplicateLoginPolicy.mockReset();
    loadAuthDuplicateLoginPolicy.mockResolvedValue(DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY);
  });

  it("A: valid active row allows", async () => {
    const sb = makeSb({
      select: () => ({ data: { active: true, invalidation_reason: null }, error: null }),
    });
    await expect(validateUserSessionRegistry(sb, "u1", "s1")).resolves.toBe(true);
    await expect(inspectUserSessionRegistry(sb, "u1", "s1")).resolves.toEqual({ ok: true, reason: "ok" });
  });

  it("B: explicitly invalidated row denies and is not resurrected by ensure", async () => {
    const sb = makeSb({
      select: () => ({
        data: { active: false, invalidation_reason: "user_logout" },
        error: null,
      }),
    });
    await expect(validateUserSessionRegistry(sb, "u1", "s1")).resolves.toBe(false);
    await expect(inspectUserSessionRegistry(sb, "u1", "s1")).resolves.toEqual({
      ok: false,
      reason: "inactive",
    });
    await expect(ensureUserSessionRegistryRow(sb, "u1", "s1")).resolves.toBe(false);
    expect((sb as { __upsert: { mock: { calls: unknown[] } } }).__upsert).not.toHaveBeenCalled();
  });

  it("C: schema/authority unavailable on protected validate fails closed", async () => {
    const sb = makeSb({
      select: () => ({ data: null, error: schemaError() }),
    });
    expect(isUserSessionSchemaError(schemaError())).toBe(true);
    await expect(inspectUserSessionRegistry(sb, "u1", "s1")).resolves.toEqual({
      ok: false,
      reason: "authority_unavailable",
    });
    await expect(validateUserSessionRegistry(sb, "u1", "s1")).resolves.toBe(false);
    await expect(ensureUserSessionRegistryRow(sb, "u1", "s1")).resolves.toBe(false);
  });

  it("D: unrelated lookup failure fails closed", async () => {
    const sb = makeSb({
      select: () => ({ data: null, error: { code: "57014", message: "timeout" } }),
    });
    await expect(inspectUserSessionRegistry(sb, "u1", "s1")).resolves.toEqual({
      ok: false,
      reason: "lookup_failed",
    });
    await expect(validateUserSessionRegistry(sb, "u1", "s1")).resolves.toBe(false);
  });

  it("E: missing row can be ensured; ensure then validates", async () => {
    let calls = 0;
    const sb = makeSb({
      select: () => {
        calls += 1;
        if (calls === 1) return { data: null, error: null };
        return { data: { active: true, invalidation_reason: null }, error: null };
      },
    });
    await expect(ensureUserSessionRegistryRow(sb, "u1", "s1")).resolves.toBe(true);
    expect((sb as { __upsert: { mock: { calls: unknown[] } } }).__upsert).toHaveBeenCalledTimes(1);
  });

  it("F: logout cleanup schema error is NO-OP (does not throw)", async () => {
    const sb = makeSb({
      update: () => ({ error: schemaError() }),
    });
    await expect(invalidateUserSessionRegistry(sb, "u1", "s1", "user_logout")).resolves.toBeUndefined();
    await expect(invalidateAllUserSessionRegistry(sb, "u1", "global_signout")).resolves.toBeUndefined();
  });

  it("G: invalidate non-schema error throws", async () => {
    const sb = makeSb({
      update: () => ({ error: { code: "42501", message: "permission denied" } }),
    });
    await expect(invalidateUserSessionRegistry(sb, "u1", "s1", "user_logout")).rejects.toThrow(
      /permission denied|session_registry_invalidate/
    );
  });

  it("H: invalidateAll writes active=false", async () => {
    const sb = makeSb({});
    await invalidateAllUserSessionRegistry(sb, "u1", "global_signout");
    expect((sb as { __update: { mock: { calls: unknown[] } } }).__update).toHaveBeenCalled();
  });

  it("I: duplicate-policy disabled skips conflict lookup", async () => {
    const select = vi.fn(() => ({ data: [], error: null }));
    const sb = makeSb({ select });
    await syncUserSessionRegistry(sb, "u1", {
      nextSessionId: "s-new",
      loginIdentifier: "a@x.com",
    });
    expect(select).not.toHaveBeenCalled();
    expect((sb as { __upsert: { mock: { calls: unknown[] } } }).__upsert).toHaveBeenCalledTimes(1);
  });

  it("J: duplicate-policy enabled + same login id is a conflict", () => {
    const policy = {
      ...DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY,
      compare_same_login_id: true,
      compare_same_device: false,
      compare_same_browser: false,
      compare_same_ip: false,
    };
    expect(
      isDuplicateLoginConflict(
        policy,
        { login_identifier: "a@x.com" },
        { login_identifier: "a@x.com" }
      )
    ).toBe(true);
    expect(
      isDuplicateLoginConflict(
        DEFAULT_AUTH_DUPLICATE_LOGIN_POLICY,
        { login_identifier: "a@x.com" },
        { login_identifier: "a@x.com" }
      )
    ).toBe(false);
  });
});
