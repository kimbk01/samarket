import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMBER_ADDRESS_CALLER_CONTEXT_KEY,
  assertCallerContextBeatsReturnToTransport,
  buildMemberAddressCallerContext,
  clearMemberAddressCallerContext,
  commitMemberAddressExit,
  consumeMemberAddressTradeWritePendingRestore,
  consumeTradeWriteRegionApplyHandoff,
  openMemberAddressBook,
  peekMemberAddressCallerContext,
  setTradeWriteRegionApplyHandoff,
  writeMemberAddressCallerContext,
} from "@/lib/addresses/member-address-caller-context";
import {
  cancelMemberAddressFlowExit,
  confirmMemberAddressFlowExit,
  resolveAddressManagementExitHref,
  writeAddressFlowExitHref,
} from "@/lib/addresses/mypage-address-flow-exit";

describe("PHASE2 member-address continuity contracts", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    setTradeWriteRegionApplyHandoff(null);
  });

  afterEach(() => {
    clearMemberAddressCallerContext();
    setTradeWriteRegionApplyHandoff(null);
    vi.unstubAllGlobals();
  });

  it("stores CallerContext only in pre-existing address-mgmt-exit key", () => {
    openMemberAddressBook(
      { push: () => {}, replace: () => {} },
      {
        caller: "trade_write",
        purpose: "select_trade_region",
        apply: { kind: "trade_region" },
        restore: {
          kind: "trade_write",
          surfaceHref: "/market/used",
          categoryId: "cat-1",
          categoryKey: "used",
          reopenSheet: true,
        },
      },
    );
    expect(MEMBER_ADDRESS_CALLER_CONTEXT_KEY).toBe("samarket:address-mgmt-exit");
    expect(sessionStorage.getItem("samarket:member-address-caller-context:v1")).toBe(null);
    expect(sessionStorage.getItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY)).toContain('"caller":"trade_write"');
  });

  it("CallerContext beats malformed returnTo transport", () => {
    openMemberAddressBook(
      { push: () => {}, replace: () => {} },
      {
        caller: "trade_write",
        purpose: "select_trade_region",
        apply: { kind: "trade_region" },
        restore: {
          kind: "trade_write",
          surfaceHref: "/market/used",
          categoryId: "cat-1",
          categoryKey: "used",
          reopenSheet: true,
        },
      },
    );
    const ctx = peekMemberAddressCallerContext()!;
    expect(assertCallerContextBeatsReturnToTransport(ctx, "/mypage")).toBe("trade_write");
    expect(resolveAddressManagementExitHref("/mypage")).toBe("/market/used");
    expect(resolveAddressManagementExitHref("/philife")).toBe("/market/used");
  });

  it("pending_restore is consume-once and rejects stale path", () => {
    const ctx = buildMemberAddressCallerContext({
      caller: "trade_write",
      purpose: "select_trade_region",
      apply: { kind: "trade_region" },
      restore: {
        kind: "trade_write",
        surfaceHref: "/market/used",
        categoryId: "cat-1",
        categoryKey: "used",
        reopenSheet: true,
      },
    });
    commitMemberAddressExit(ctx, "confirm");
    expect(consumeMemberAddressTradeWritePendingRestore("/market/other")).toBe(null);
    expect(peekMemberAddressCallerContext()?.phase).toBe("pending_restore");
    expect(consumeMemberAddressTradeWritePendingRestore("/market/used")).toEqual({
      categoryKey: "used",
      categoryId: "cat-1",
      exitIntent: "confirm",
      selectedAddressId: null,
    });
    expect(peekMemberAddressCallerContext()).toBe(null);
    expect(consumeMemberAddressTradeWritePendingRestore("/market/used")).toBe(null);
  });

  it("cancel exit restores without leaving region handoff", () => {
    openMemberAddressBook(
      { push: () => {}, replace: () => {} },
      {
        caller: "trade_write",
        purpose: "select_trade_region",
        apply: { kind: "trade_region" },
        restore: {
          kind: "trade_write",
          surfaceHref: "/market/used",
          categoryId: "cat-1",
          categoryKey: "used",
          reopenSheet: true,
        },
      },
    );
    setTradeWriteRegionApplyHandoff({
      addressId: "a1",
      regionId: "r1",
      cityId: "c1",
      displayLine: "should-not-apply-on-cancel",
    });
    setTradeWriteRegionApplyHandoff(null);
    expect(cancelMemberAddressFlowExit("/mypage")).toBe("/market/used");
    expect(consumeTradeWriteRegionApplyHandoff()).toBe(null);
    const pending = consumeMemberAddressTradeWritePendingRestore("/market/used");
    expect(pending?.exitIntent).toBe("cancel");
  });

  it("confirm exit keeps region handoff for draft apply", () => {
    openMemberAddressBook(
      { push: () => {}, replace: () => {} },
      {
        caller: "trade_write",
        purpose: "select_trade_region",
        apply: { kind: "trade_region" },
        restore: {
          kind: "trade_write",
          surfaceHref: "/market/used",
          categoryId: "cat-1",
          categoryKey: "used",
          reopenSheet: true,
        },
      },
    );
    setTradeWriteRegionApplyHandoff({
      addressId: "a1",
      regionId: "r1",
      cityId: "c1",
      displayLine: "Pasig City",
    });
    writeMemberAddressCallerContext({
      ...peekMemberAddressCallerContext()!,
      selectedAddressId: "a1",
    });
    expect(confirmMemberAddressFlowExit("/mypage")).toBe("/market/used");
    expect(consumeTradeWriteRegionApplyHandoff()).toEqual({
      addressId: "a1",
      regionId: "r1",
      cityId: "c1",
      displayLine: "Pasig City",
    });
    expect(consumeTradeWriteRegionApplyHandoff()).toBe(null);
  });

  it("legacy plain href in same key migrates on peek once", () => {
    sessionStorage.setItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY, "/stores");
    expect(peekMemberAddressCallerContext()?.caller).toBe("unknown");
    expect(resolveAddressManagementExitHref(null)).toBe("/stores");
    writeAddressFlowExitHref("/philife");
    expect(peekMemberAddressCallerContext()?.caller).toBe("unknown");
    expect(JSON.parse(sessionStorage.getItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY)!).restore.href).toBe(
      "/philife",
    );
  });
});
