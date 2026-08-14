import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import {
  clearAddressPlatformV2Draft,
  readAddressPlatformV2Draft,
  shouldRedirectCreateDetailToSearch,
  writeAddressPlatformV2Draft,
} from "@/lib/addresses/canonical-address-draft-storage";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";

const mallDraft: CanonicalAddressDraft = {
  latitude: 14.5352,
  longitude: 120.9822,
  placeId: "ChIJ-mall-moa",
  placeName: "SM Mall of Asia",
  placeTypes: ["shopping_mall"],
  streetNumber: null,
  route: "Seaside Boulevard",
  streetAddress: "Seaside Boulevard",
  barangay: null,
  cityMunicipality: "Pasay",
  province: "Metro Manila",
  postalCode: null,
  neighborhoodName: null,
  formattedAddress: "Seaside Boulevard, Pasay, Metro Manila",
  identitySource: "place_details",
  samePlaceAsPreferred: false,
};

const houseDraft: CanonicalAddressDraft = {
  ...mallDraft,
  latitude: 14.576,
  longitude: 121.085,
  placeId: "ChIJ-house",
  placeName: null,
  placeTypes: [],
  streetNumber: "123",
  route: "Sampaguita Street",
  streetAddress: "123 Sampaguita Street",
  barangay: "San Antonio",
  cityMunicipality: "Pasig",
  formattedAddress: "123 Sampaguita Street, Barangay San Antonio, Pasig",
  identitySource: "address_only",
};

function installSessionStorage(): void {
  const store: Record<string, string> = {};
  const sessionStorage = {
    getItem(k: string) {
      return store[k] ?? null;
    },
    setItem(k: string, v: string) {
      store[k] = v;
    },
    removeItem(k: string) {
      delete store[k];
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
    key() {
      return null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
  vi.stubGlobal("window", { sessionStorage });
  vi.stubGlobal("sessionStorage", sessionStorage);
}

describe("Stage D Search → Detail handoff", () => {
  beforeEach(() => {
    installSessionStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("read is non-destructive: remount / second effect still sees the draft", () => {
    writeAddressPlatformV2Draft({ draft: mallDraft, source: "search" });
    const first = readAddressPlatformV2Draft();
    const second = readAddressPlatformV2Draft();
    expect(first?.draft.placeName).toBe("SM Mall of Asia");
    expect(first?.draft.placeId).toBe("ChIJ-mall-moa");
    expect(second?.draft.placeName).toBe("SM Mall of Asia");
    expect(second?.draft.placeId).toBe("ChIJ-mall-moa");
    expect(second?.draft.latitude).toBe(14.5352);
    expect(second?.draft.longitude).toBe(120.9822);
    expect(shouldRedirectCreateDetailToSearch("", false, second?.draft ?? null)).toBe(false);
  });

  it("clear happens only via explicit clear, not via read", () => {
    writeAddressPlatformV2Draft({ draft: mallDraft, source: "search" });
    readAddressPlatformV2Draft();
    expect(readAddressPlatformV2Draft()?.draft.placeName).toBe("SM Mall of Asia");
    clearAddressPlatformV2Draft();
    expect(readAddressPlatformV2Draft()).toBeNull();
    expect(shouldRedirectCreateDetailToSearch("", false, null)).toBe(true);
  });

  it("new search write replaces the previous draft (new address flow)", () => {
    writeAddressPlatformV2Draft({ draft: mallDraft, source: "search" });
    writeAddressPlatformV2Draft({ draft: houseDraft, source: "search" });
    const next = readAddressPlatformV2Draft()?.draft ?? null;
    expect(next?.placeName).toBeNull();
    expect(next?.streetAddress).toBe("123 Sampaguita Street");
  });

  it("mall draft still displays Place name after two reads", () => {
    writeAddressPlatformV2Draft({ draft: mallDraft, source: "search" });
    readAddressPlatformV2Draft();
    const draft = readAddressPlatformV2Draft()?.draft;
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(draft!));
    expect(lines.title).toBe("SM Mall of Asia");
    expect(lines.addressLine).toContain("Seaside Boulevard");
  });

  it("residential draft still displays street title after remount read", () => {
    writeAddressPlatformV2Draft({ draft: houseDraft, source: "search" });
    readAddressPlatformV2Draft();
    const draft = readAddressPlatformV2Draft()?.draft;
    const lines = resolveCanonicalDisplayLines(displayInputFromDraft(draft!));
    expect(lines.title).toBe("123 Sampaguita Street");
    expect(lines.addressLine).toContain("San Antonio");
  });
});
