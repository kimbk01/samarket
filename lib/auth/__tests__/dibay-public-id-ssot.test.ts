import { describe, expect, it } from "vitest";
import {
  evaluatePublicIdProfileView,
  isPublicIdSetupComplete,
  resolvePublicIdAtDisplay,
  resolvePublicIdInputSeed,
  resolveSearchablePublicId,
} from "@/lib/auth/dibay-public-id-ssot";

describe("dibay-public-id-ssot", () => {
  it("locked dibay_id is setup complete and displayed", () => {
    const row = {
      dibay_id: "boss_market",
      dibay_id_locked: true,
      username: "boss_market",
    };
    expect(isPublicIdSetupComplete(row)).toBe(true);
    expect(resolvePublicIdAtDisplay(row)).toBe("@boss_market");
    expect(resolveSearchablePublicId(row)).toBe("boss_market");
  });

  it("legacy username_confirmed without lock is complete", () => {
    const row = {
      username: "aaaa",
      username_confirmed: true,
      dibay_id_locked: false,
    };
    expect(isPublicIdSetupComplete(row)).toBe(true);
    expect(resolvePublicIdAtDisplay(row)).toBe("@aaaa");
  });

  it("unconfirmed username is not setup complete but seeds input", () => {
    const row = {
      username: "draft_id",
      username_confirmed: false,
      dibay_id_locked: false,
    };
    expect(isPublicIdSetupComplete(row)).toBe(false);
    expect(resolvePublicIdAtDisplay(row)).toBeNull();
    expect(resolveSearchablePublicId(row)).toBeNull();
    expect(resolvePublicIdInputSeed(row)).toBe("draft_id");
  });

  it("auto dibay_* is never searchable or complete", () => {
    const row = {
      dibay_id: "dibay_a1b2c3",
      dibay_id_locked: true,
      username_confirmed: true,
    };
    expect(isPublicIdSetupComplete(row)).toBe(false);
    expect(resolveSearchablePublicId(row)).toBeNull();
  });

  it("evaluatePublicIdProfileView bundles UI fields", () => {
    const view = evaluatePublicIdProfileView({
      dibay_id: "qqqq",
      dibay_id_locked: true,
      username: "qqqq",
    });
    expect(view.setupComplete).toBe(true);
    expect(view.atDisplay).toBe("@qqqq");
    expect(view.searchableId).toBe("qqqq");
    expect(view.locked).toBe(true);
  });
});
