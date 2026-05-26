import { describe, expect, it } from "vitest";
import { parseStoredAddressBookPresentation } from "@/lib/addresses/address-book-card-presentation";

describe("parseStoredAddressBookPresentation", () => {
  it("parses gate + street from json object", () => {
    expect(
      parseStoredAddressBookPresentation({
        gatePrefix: "1212",
        streetBody: "Life Arcade, 624 Paterno St, 307 Quiapo, Manila, 1001 Metro Manila",
      })
    ).toEqual({
      gatePrefix: "1212",
      streetBody: "Life Arcade, 624 Paterno St, 307 Quiapo, Manila, 1001 Metro Manila",
    });
  });

  it("returns null for empty or invalid payloads", () => {
    expect(parseStoredAddressBookPresentation(null)).toBeNull();
    expect(parseStoredAddressBookPresentation({})).toBeNull();
    expect(parseStoredAddressBookPresentation({ gatePrefix: "  ", streetBody: "" })).toBeNull();
  });
});
