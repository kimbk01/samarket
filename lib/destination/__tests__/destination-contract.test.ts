import { describe, expect, it } from "vitest";
import {
  destinationHref,
  parseDestinationHref,
  validateDestinationRef,
} from "@/lib/destination/destination-contract";

describe("DestinationRef contract", () => {
  it("internal paths stay same-origin", () => {
    expect(parseDestinationHref("/market?x=1")).toEqual({ ok: true, ref: { kind: "internal_route", path: "/market?x=1" } });
    for (const bad of ["//evil.com", "/\\evil.com", "/a\nb", "javascript:alert(1)", "ftp://x"]) {
      expect(parseDestinationHref(bad).ok).toBe(false);
    }
  });

  it("member surfaces cannot deep-link into admin / owner consoles", () => {
    expect(parseDestinationHref("/admin/users")).toEqual({ ok: false, error: "internal_path_forbidden" });
    expect(parseDestinationHref("/stores/owner/x")).toEqual({ ok: false, error: "internal_path_forbidden" });
    expect(parseDestinationHref("/stores/abc").ok).toBe(true);
    expect(parseDestinationHref("/admin/users", { allowAdmin: true }).ok).toBe(true);
  });

  it("/events/:id becomes an event destination", () => {
    expect(parseDestinationHref("/events/ev%201")).toEqual({ ok: true, ref: { kind: "event", eventId: "ev 1" } });
    expect(destinationHref({ kind: "event", eventId: "ev 1" })).toBe("/events/ev%201");
  });

  it("external links require https", () => {
    expect(parseDestinationHref("https://example.com/a")).toEqual({
      ok: true,
      ref: { kind: "external_url", url: "https://example.com/a" },
    });
    expect(parseDestinationHref("http://example.com")).toEqual({ ok: false, error: "https_required" });
  });

  it("structured refs are re-validated", () => {
    expect(validateDestinationRef({ kind: "event", eventId: " " }).ok).toBe(false);
    expect(validateDestinationRef({ kind: "internal_route", path: "//x" }).ok).toBe(false);
    expect(validateDestinationRef({ kind: "external_url", url: "https://a.b" }).ok).toBe(true);
  });
});
