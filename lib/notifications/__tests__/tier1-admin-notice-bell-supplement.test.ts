import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveTier1AdminNoticeBellSupplement,
  clearTier1AdminNoticeBellSupplementOptimistic,
} from "@/lib/notifications/tier1-admin-notice-bell-supplement";

describe("tier1 admin notice bell supplement (quarantined)", () => {
  beforeEach(() => {});

  it("never re-adds adminNotice onto Header Bell digit", () => {
    expect(resolveTier1AdminNoticeBellSupplement("tier1_inbox_bell")).toBe(0);
    expect(resolveTier1AdminNoticeBellSupplement("bottom_nav_community")).toBe(0);
    expect(resolveTier1AdminNoticeBellSupplement("bottom_nav_chat")).toBe(0);
  });

  it("direct clearOptimistic is no-op (projection rebuild path owns UX)", () => {
    expect(clearTier1AdminNoticeBellSupplementOptimistic()).toBe(false);
  });
});
