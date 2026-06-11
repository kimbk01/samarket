import { describe, expect, it, vi } from "vitest";
import { findPhoneDuplicateOnOtherProfile } from "@/lib/auth/phone-otp-duplicate-check";

type Row = { id: string };

function mockSb(hits: { phone?: Row[]; phone_number?: Row[] }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          neq: () => ({
            limit: async () => {
              if (table !== "profiles") return { data: [], error: null };
              if (col === "phone") {
                const row = hits.phone?.find(() => true);
                return { data: row ? [row] : [], error: null };
              }
              if (col === "phone_number") {
                const row = hits.phone_number?.find(() => true);
                return { data: row ? [row] : [], error: null };
              }
              return { data: [], error: null };
            },
          }),
        }),
      }),
    }),
  };
}

describe("findPhoneDuplicateOnOtherProfile", () => {
  it("returns null when no duplicate", async () => {
    const sb = mockSb({});
    const hit = await findPhoneDuplicateOnOtherProfile(sb as never, "me", "09171234567");
    expect(hit).toBeNull();
  });

  it("detects duplicate on phone_number national field", async () => {
    const sb = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col: string) => ({
            neq: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(async () => {
                if (table === "profiles" && col === "phone_number") {
                  return { data: [{ id: "other-user" }], error: null };
                }
                return { data: [], error: null };
              }),
            }),
          })),
        }),
      })),
    };
    const hit = await findPhoneDuplicateOnOtherProfile(sb as never, "me", "09171234567");
    expect(hit?.profileId).toBe("other-user");
    expect(hit?.matchedOn).toBe("phone_number");
  });
});
