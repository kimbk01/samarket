import { describe, expect, it } from "vitest";
import {
  isHardRejectedCurrentPinIdentity,
  rankCurrentPinIdentityCandidates,
  type CurrentPinIdentityCandidate,
} from "@/lib/addresses/resolve-current-pin-canonical-address";

function c(
  partial: Partial<CurrentPinIdentityCandidate> & Pick<CurrentPinIdentityCandidate, "name" | "identityKind">,
): CurrentPinIdentityCandidate {
  return {
    source: partial.source ?? "places_nearby",
    placeId: partial.placeId ?? `ChIJ-${partial.name.replace(/\s+/g, "")}`,
    name: partial.name,
    kinds: partial.kinds ?? [],
    identityKind: partial.identityKind,
    distanceMeters: partial.distanceMeters ?? 30,
    geometry: partial.geometry ?? null,
  };
}

describe("rankCurrentPinIdentityCandidates — CURRENT PIN SSOT", () => {
  it("Victoria Towers premise beats nearer Panay Avenue transit", () => {
    const winner = rankCurrentPinIdentityCandidates([
      c({
        name: "Panay Avenue",
        identityKind: "other",
        kinds: ["transit_station", "point_of_interest"],
        distanceMeters: 12,
        source: "places_nearby",
      }),
      c({
        name: "Victoria Towers",
        identityKind: "premise",
        kinds: ["premise"],
        distanceMeters: 28,
        source: "geocoder_premise",
      }),
    ]);
    expect(winner?.name).toBe("Victoria Towers");
  });

  it("hard-rejects transit / route / locality without establishment|premise evidence", () => {
    expect(
      isHardRejectedCurrentPinIdentity({
        kinds: ["transit_station"],
        identityKind: "other",
      }),
    ).toBe(true);
    expect(
      isHardRejectedCurrentPinIdentity({
        kinds: ["route"],
        identityKind: "road",
      }),
    ).toBe(true);
    expect(
      isHardRejectedCurrentPinIdentity({
        kinds: ["locality"],
        identityKind: "admin",
      }),
    ).toBe(true);
    expect(
      isHardRejectedCurrentPinIdentity({
        kinds: ["establishment", "point_of_interest"],
        identityKind: "establishment",
      }),
    ).toBe(false);
  });

  it("establishment beats farther premise when both eligible", () => {
    const winner = rankCurrentPinIdentityCandidates([
      c({
        name: "Ummason",
        identityKind: "establishment",
        kinds: ["establishment", "point_of_interest"],
        distanceMeters: 18,
        source: "places_details",
      }),
      c({
        name: "Some Building",
        identityKind: "premise",
        kinds: ["premise"],
        distanceMeters: 10,
        source: "geocoder_premise",
      }),
    ]);
    expect(winner?.name).toBe("Ummason");
  });

  it("nearest alone does not win when type is weaker", () => {
    const winner = rankCurrentPinIdentityCandidates([
      c({
        name: "Random Spot",
        identityKind: "other",
        kinds: ["point_of_interest"],
        distanceMeters: 5,
        source: "places_nearby",
      }),
      c({
        name: "Victoria Towers",
        identityKind: "premise",
        kinds: ["premise"],
        distanceMeters: 40,
        source: "geocoder_premise",
      }),
    ]);
    expect(winner?.name).toBe("Victoria Towers");
  });

  it("returns null when only road/admin candidates remain", () => {
    const winner = rankCurrentPinIdentityCandidates([
      c({
        name: "Timog Avenue",
        identityKind: "road",
        kinds: ["route"],
        distanceMeters: 1,
      }),
      c({
        name: "Quezon City",
        identityKind: "admin",
        kinds: ["locality"],
        distanceMeters: 1,
      }),
    ]);
    expect(winner).toBeNull();
  });
});
