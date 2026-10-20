import { describe, expect, it } from "vitest";
import {
  evaluatePublicIdProfileView,
  isPublicIdSearchEligible,
  isPublicIdSetupComplete,
  matchesPublicIdExactly,
  resolveExactLookupPublicId,
  resolvePublicIdAtDisplay,
  resolveSearchablePublicId,
} from "@/lib/auth/dibay-public-id-ssot";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";

describe("dibay-public-id-ssot auto-assign policy", () => {
  const autoRow = {
    dibay_id: "dibay_a1b2c3",
    dibay_id_auto_assigned: true,
    dibay_id_changed_once: false,
    dibay_id_locked: false,
    username: "dibay_a1b2c3",
    username_confirmed: true,
  };

  it("auto-assigned dibay_* passes setup gate", () => {
    expect(isPublicIdSetupComplete(autoRow)).toBe(true);
  });

  it("auto-assigned dibay_* is displayed but not searchable", () => {
    expect(resolvePublicIdAtDisplay(autoRow)).toBe("@dibay_a1b2c3");
    expect(resolveSearchablePublicId(autoRow)).toBeNull();
  });

  it("auto-assigned dibay_* is found by exact id lookup only (policy B)", () => {
    expect(resolveExactLookupPublicId(autoRow)).toBe("dibay_a1b2c3");
    expect(matchesPublicIdExactly(autoRow, "dibay_a1b2c3")).toBe(true);
    expect(matchesPublicIdExactly(autoRow, "@DIBAY_A1B2C3")).toBe(true);
    expect(matchesPublicIdExactly(autoRow, "dibay_a1b2")).toBe(false);
    expect(matchesPublicIdExactly(autoRow, "a1b2c3")).toBe(false);
    expect(isPublicIdSearchEligible(autoRow)).toBe(false);
  });

  it("admin-changed id keeps the member's own one-time change right (policy C)", () => {
    const adminChanged = {
      dibay_id: "jjchoi",
      dibay_id_auto_assigned: true,
      dibay_id_changed_once: false,
      dibay_id_locked: false,
      username: "jjchoi",
      username_confirmed: true,
    };
    const view = evaluatePublicIdProfileView(adminChanged);
    expect(view.setupComplete).toBe(true);
    expect(view.canChangeOnce).toBe(true);
    expect(view.changeComplete).toBe(false);
    expect(resolveSearchablePublicId(adminChanged)).toBe("jjchoi");
    expect(matchesPublicIdExactly(adminChanged, "jjchoi")).toBe(true);

    const usedRight = { ...adminChanged, dibay_id_auto_assigned: false, dibay_id_changed_once: true, dibay_id_locked: true };
    expect(evaluatePublicIdProfileView(usedRight).canChangeOnce).toBe(false);
  });

  it("evaluatePublicIdProfileView exposes auto-assigned change-once state", () => {
    const view = evaluatePublicIdProfileView(autoRow);
    expect(view.setupComplete).toBe(true);
    expect(view.autoAssigned).toBe(true);
    expect(view.canChangeOnce).toBe(true);
    expect(view.changeComplete).toBe(false);
    expect(view.locked).toBe(false);
  });

  it("changed custom id is complete, searchable, and locked", () => {
    const row = {
      dibay_id: "my_custom",
      dibay_id_auto_assigned: false,
      dibay_id_changed_once: true,
      dibay_id_locked: true,
      username: "my_custom",
      username_confirmed: true,
    };
    const view = evaluatePublicIdProfileView(row);
    expect(view.setupComplete).toBe(true);
    expect(view.autoAssigned).toBe(false);
    expect(view.canChangeOnce).toBe(false);
    expect(view.changeComplete).toBe(true);
    expect(view.locked).toBe(true);
    expect(resolveSearchablePublicId(row)).toBe("my_custom");
  });

  it("auto-assigned id passes dibay gate but phone gate still blocks community_write", () => {
    const gate = evaluateProfileRequirements(
      {
        ...autoRow,
        display_name: "홍길동",
        phone_verified: false,
      },
      "community_write"
    );
    expect(gate.satisfied).toBe(false);
    expect(gate.missingFields).toContain("phone_verified");
    expect(gate.missingFields).not.toContain("dibay_id");
  });

  it("auto-assigned id with verified phone passes community_write", () => {
    const gate = evaluateProfileRequirements(
      {
        ...autoRow,
        display_name: "홍길동",
        phone_verified: true,
        phone_verified_at: "2026-01-01T00:00:00.000Z",
      },
      "community_write"
    );
    expect(gate.satisfied).toBe(true);
  });
});
