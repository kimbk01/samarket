/**
 * Phase 11D-B — classification helpers (no live DB).
 */
import { describe, expect, it } from "vitest";
import {
  PHASE11D_B_SHADOW_WRITE,
  PHASE11D_B_UI_WIRING,
  compareDomainRoomSets,
  evaluateUiCanaryGate,
  summarizeClassCounts,
  type Phase11dBParityRow,
} from "@/lib/messenger/contracts/phase11db-legacy-shadow-parity";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";

const row = (id: string, extra: Partial<Phase11dBParityRow> = {}): Phase11dBParityRow => ({
  roomId: id,
  chatDomain: "general_direct",
  domainIdentityKey: `general_direct:a:${id}`,
  title: "t",
  avatar: null,
  preview: "p",
  lastMessageAt: "2026-07-01T00:00:00.000Z",
  unread: 0,
  ...extra,
});

describe("Phase 11D-B parity classifiers", () => {
  it("writers/UI remain OFF", () => {
    expect(PHASE11D_B_SHADOW_WRITE).toBe(false);
    expect(PHASE11D_B_UI_WIRING).toBe(false);
  });

  it("legacy-only room → LEGACY_CORRECT_NEW_MISSING", () => {
    const cmp = compareDomainRoomSets({
      domain: "general_direct",
      legacy: [row("L1")],
      neu: [],
      legacyCap: 30,
      legacyAllRoomIds: new Set(["L1"]),
    });
    expect(cmp.diffs[0]?.classification).toBe("LEGACY_CORRECT_NEW_MISSING");
  });

  it("new-only beyond legacy set → POLICY_DIFFERENCE (cap/lifecycle)", () => {
    const cmp = compareDomainRoomSets({
      domain: "trade",
      legacy: [],
      neu: [row("N1", { chatDomain: "trade" })],
      legacyCap: 30,
      legacyAllRoomIds: new Set(),
    });
    expect(cmp.diffs[0]?.classification).toBe("POLICY_DIFFERENCE");
  });

  it("UI gate blocks on NEW_MISSING", () => {
    const counts = summarizeClassCounts([
      {
        roomId: "x",
        domainIdentityKey: null,
        classification: "LEGACY_CORRECT_NEW_MISSING",
        reason: "test",
      },
    ]);
    const gate = evaluateUiCanaryGate({
      validRounds: 3,
      classCounts: counts,
      ownerNameLeak: false,
      hubLatestAlignedWhenComparable: true,
    });
    expect(gate.allowed).toBe(false);
  });
  it("store_order owner-surface legacy-only → NEW_CORRECT_LEGACY_WRONG", () => {
    const cmp = compareDomainRoomSets({
      domain: "store_order",
      legacy: [row("OWN1", { chatDomain: "store_order", title: "Buyer (@x)" })],
      neu: [],
      legacyCap: 30,
      legacyAllRoomIds: new Set(["OWN1"]),
      storeOrderOwnerRoomIds: new Set(["OWN1"]),
    });
    expect(cmp.diffs[0]?.classification).toBe("NEW_CORRECT_LEGACY_WRONG");
  });
});