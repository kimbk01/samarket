/**
 * STEP1 — Domain Bootstrap Shadow observe isolation (Legacy authority · no merge/UI/writes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shadowCompareMock = vi.fn();

vi.mock("@/lib/messenger/contracts/phase11da-canary-runtime", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/messenger/contracts/phase11da-canary-runtime")
  >("@/lib/messenger/contracts/phase11da-canary-runtime");
  return {
    ...actual,
    runPhase11dAShadowCompare: (...args: unknown[]) => shadowCompareMock(...args),
  };
});

import {
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  getPhase11dAShadowPassStreak,
  isPhase11dAShellDisplayAllowed,
  recordPhase11dAShadowPass,
  resetPhase11dACanaryKillForTests,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import {
  runDomainBootstrapShadowObserve,
  scheduleDomainBootstrapShadowObserve,
  type DomainBootstrapShadowLegacySurfaces,
} from "@/lib/messenger/contracts/domain-bootstrap-shadow-observe";
import {
  PHASE11D_B_MERGE_FORBIDDEN,
  PHASE11D_B_SHADOW_WRITE,
  PHASE11D_B_UI_WIRING,
} from "@/lib/messenger/contracts/phase11db-legacy-shadow-parity";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";

const emptyLegacy: DomainBootstrapShadowLegacySurfaces = {
  roomListCap: 30,
  allRoomIds: [],
  generalDirect: [],
  group: [],
  trade: [],
  storeOrder: [],
  tradeHub: {
    roomCount: 0,
    unreadMetric: 0,
    unreadUnit: "message_sum",
    latestRoomId: null,
    latestActivityAt: null,
    preview: "",
    href: "/community-messenger/trade-chats",
  },
  storeOrderHub: {
    roomCount: 0,
    unreadMetric: 0,
    unreadUnit: "message_sum",
    latestRoomId: null,
    latestActivityAt: null,
    preview: "",
    href: "/community-messenger/delivery-chats",
  },
};

beforeEach(() => {
  shadowCompareMock.mockReset();
});

afterEach(() => {
  resetPhase11dACanaryKillForTests();
  vi.clearAllMocks();
});

describe("STEP1 domain bootstrap shadow observe", () => {
  it("allowlist skips observe (Domain Read Surface owns path)", async () => {
    const out = await runDomainBootstrapShadowObserve({
      viewerUserId: CANARY,
      legacy: emptyLegacy,
    });
    expect(out).toMatchObject({
      ok: true,
      skipped: "allowlist",
      shellUnlockRecorded: false,
      uiApplied: false,
    });
    expect(shadowCompareMock).not.toHaveBeenCalled();
  });

  it("all-user Domain Authority skips shadow observe (allowlist gate)", async () => {
    recordPhase11dAShadowPass(true);
    recordPhase11dAShadowPass(true);
    expect(getPhase11dAShadowPassStreak()).toBe(2);
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);

    shadowCompareMock.mockRejectedValue(new Error("simulated_shadow_failure"));

    const out = await runDomainBootstrapShadowObserve({
      viewerUserId: OTHER,
      legacy: emptyLegacy,
    });
    expect(out).toMatchObject({
      ok: true,
      skipped: "allowlist",
      shellUnlockRecorded: false,
      uiApplied: false,
    });
    expect(shadowCompareMock).not.toHaveBeenCalled();
    expect(getPhase11dAShadowPassStreak()).toBe(2);
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);
  });

  it("CONNECTED writers: all-user allowlist skips shadow compare (no unlock)", async () => {
    shadowCompareMock.mockResolvedValue({
      pass: true,
      reasons: [],
      newInboxRoomIds: [],
      newGroupRoomIds: [],
      tradeRoomIds: [],
      storeOrderRoomIds: [],
      parityRows: {
        generalDirect: [],
        group: [],
        trade: [],
        storeOrder: [],
      },
      tradeHub: { roomCount: 0, unreadCount: 0, latestRoomId: null, preview: "" },
      storeOrderHub: { roomCount: 0, unreadCount: 0, latestRoomId: null, preview: "" },
      contamination: { tradeInInbox: false, storeOrderInInbox: false },
      storeOrderCustomer: {
        allStoreTitles: true,
        ownerNameLeak: false,
        hubMatchesLatest: true,
        distinctOrders: 0,
        sampleStoreName: null,
        sampleStoreImage: null,
        samplePreview: null,
      },
      durationMs: 12,
      metas: { gd: null, group: null, trade: null, so: null },
      shellDisplayAllowedAfter: false,
      writes: {
        sessionStorage: 0,
        localStorage: 0,
        persistentDomainCache: 0,
        realtime: 0,
        badge: 0,
        legacyStateMutated: 0,
      },
    });

    const out = await runDomainBootstrapShadowObserve({
      viewerUserId: OTHER,
      legacy: emptyLegacy,
    });
    expect(out).toMatchObject({
      ok: true,
      skipped: "allowlist",
      shellUnlockRecorded: false,
      uiApplied: false,
    });
    expect(shadowCompareMock).not.toHaveBeenCalled();
  });

  it("schedule never throws into product path", () => {
    shadowCompareMock.mockRejectedValue(new Error("async_fail"));
    expect(() =>
      scheduleDomainBootstrapShadowObserve({
        viewerUserId: OTHER,
        legacy: emptyLegacy,
      })
    ).not.toThrow();
  });

  it("Phase11D-B shadow flags remain diagnose-only", () => {
    expect(PHASE11D_B_SHADOW_WRITE).toBe(false);
    expect(PHASE11D_B_UI_WIRING).toBe(false);
    expect(PHASE11D_B_MERGE_FORBIDDEN).toBe(true);
  });
});
