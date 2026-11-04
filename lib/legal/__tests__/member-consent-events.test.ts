import { describe, expect, it, vi } from "vitest";
import {
  appendMemberConsentEventStrict,
  appendMemberConsentEventsStrict,
} from "@/lib/legal/member-consent-events";

describe("appendMemberConsentEventStrict", () => {
  it("returns ok when insert succeeds", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const sb = { from: vi.fn(() => ({ insert })) };
    const r = await appendMemberConsentEventStrict(sb, {
      userId: "u1",
      kind: "terms",
      action: "agree",
      source: "signup",
      version: "v1",
    });
    expect(r).toEqual({ ok: true });
  });

  it("fails closed when table missing (no soft skip success)", async () => {
    const insert = vi.fn(async () => ({
      error: { message: "relation \"member_consent_events\" does not exist" },
    }));
    const sb = { from: vi.fn(() => ({ insert })) };
    const r = await appendMemberConsentEventStrict(sb, {
      userId: "u1",
      kind: "marketing",
      action: "agree",
      source: "settings",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("table_missing");
  });

  it("stops on first failure in batch", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "boom" } });
    const sb = { from: vi.fn(() => ({ insert })) };
    const r = await appendMemberConsentEventsStrict(sb, [
      { userId: "u1", kind: "terms", action: "agree", source: "signup", version: "t1" },
      { userId: "u1", kind: "privacy", action: "agree", source: "signup", version: "p1" },
    ]);
    expect(r.ok).toBe(false);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
