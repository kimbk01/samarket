import { describe, expect, it } from "vitest";
import {
  formatPhMobileDisplay,
  isCompletePhMobile,
  normalizeOptionalPhMobileDb,
  normalizePhMobileDb,
  parsePhMobileInput,
  PH_LOCAL_MOBILE_LENGTH,
} from "./ph-mobile";

describe("parsePhMobileInput", () => {
  it("accepts 11-digit 09 local", () => {
    expect(parsePhMobileInput("09171234567")).toBe("09171234567");
  });

  it("formats +63 paste to local 09", () => {
    expect(parsePhMobileInput("+63 917 123 4567")).toBe("09171234567");
    expect(parsePhMobileInput("639171234567")).toBe("09171234567");
  });

  it("prefix 9 without leading 0", () => {
    expect(parsePhMobileInput("9171234567")).toBe("09171234567");
  });

  it("allows partial 0 then 09", () => {
    expect(parsePhMobileInput("0")).toBe("0");
    expect(parsePhMobileInput("09")).toBe("09");
    expect(parsePhMobileInput("0917")).toBe("0917");
  });

  it("rejects leading digit other than 0/63/9 pattern", () => {
    expect(parsePhMobileInput("8")).toBe("");
    expect(parsePhMobileInput("18171234567")).toBe("");
  });

  it("rejects 08… after 0", () => {
    expect(parsePhMobileInput("08")).toBe("0");
  });

  it("rejects 63 not followed by 9", () => {
    expect(parsePhMobileInput("638123456789")).toBe("");
  });
});

describe("normalizePhMobileDb / isCompletePhMobile", () => {
  it("normalizes complete number", () => {
    expect(normalizePhMobileDb("09171234567")).toBe("09171234567");
    expect(isCompletePhMobile("09171234567")).toBe(true);
  });

  it("null for partial", () => {
    expect(normalizePhMobileDb("0917")).toBeNull();
    expect(isCompletePhMobile("0917")).toBe(false);
  });
});

describe("formatPhMobileDisplay", () => {
  it("groups as 09 ## ### ####", () => {
    expect(formatPhMobileDisplay("09171234567")).toBe("09 17 123 4567");
  });
});

describe("normalizeOptionalPhMobileDb", () => {
  it("empty → null", () => {
    expect(normalizeOptionalPhMobileDb("")).toEqual({ ok: true, value: null });
    expect(normalizeOptionalPhMobileDb("   ")).toEqual({ ok: true, value: null });
  });

  it("complete → value", () => {
    expect(normalizeOptionalPhMobileDb("09 17 123 4567")).toEqual({
      ok: true,
      value: "09171234567",
    });
  });

  it("incomplete → error", () => {
    const r = normalizeOptionalPhMobileDb("0917");
    expect(r.ok).toBe(false);
  });
});

describe("PH_LOCAL_MOBILE_LENGTH", () => {
  it("is 11", () => {
    expect(PH_LOCAL_MOBILE_LENGTH).toBe(11);
  });
});
