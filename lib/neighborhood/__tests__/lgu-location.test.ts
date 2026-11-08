/**
 * 주소 SSOT 2단계 — 커뮤니티 동네 = 시/군 LGU. 예전 동네 행(운영 locations)이 같은 시/군 피드에 묶이는지 고정.
 */
import { describe, expect, it } from "vitest";
import {
  legacyLocationRowToLguId,
  lguLocationKey,
  lguPublicName,
  parseLguLocationKey,
} from "@/lib/neighborhood/lgu-location.server";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";

describe("커뮤니티 동네 키 = 시/군 LGU", () => {
  it("키 형식 lgu:<PSGC>:", () => {
    expect(lguLocationKey("1381300000")).toBe("lgu:1381300000:");
    expect(parseLguLocationKey("lgu:1381300000:")).toBe("1381300000");
    expect(parseLguLocationKey("quezon:q1:")).toBeNull();
    expect(lguPublicName("1381300000")).toBe("Quezon City");
  });

  it("운영 locations 행(지역 이름, 동네 이름) → 같은 시/군", () => {
    expect(legacyLocationRowToLguId("Quezon City", "Batasan Hills")).toBe("1381300000");
    expect(legacyLocationRowToLguId("Quezon City", "Diliman")).toBe("1381300000");
    expect(legacyLocationRowToLguId("Manila", "Makati")).toBe("1380300000");
    expect(legacyLocationRowToLguId("Manila", "Pasig – Ortigas Center")).toBe("1381200000");
    expect(legacyLocationRowToLguId("Manila", "Binondo")).toBe("1380600000");
    expect(legacyLocationRowToLguId("Manila", "Quiapo")).toBe("1380600000");
    // 운영의 잘못 만들어진 행은 어느 시/군에도 묶지 않는다
    expect(legacyLocationRowToLguId("684-718", "684-718")).toBeNull();
    expect(legacyLocationRowToLguId("metro-manila", "metro-manila")).toBeNull();
  });
});

describe("입력 — Google 도/시 칸 (필리핀 구성)", () => {
  const comp = (long_name: string, types: string[]) => ({ long_name, short_name: long_name, types });
  it("aal1=지역(Calabarzon)·aal2=도(Cavite) → 도 칸은 Cavite, 시/군은 locality", () => {
    const p = parsePhFromGooglePlaceResult({
      address_components: [
        comp("Molino IV", ["sublocality_level_1", "sublocality"]),
        comp("Bacoor", ["locality", "political"]),
        comp("Cavite", ["administrative_area_level_2", "political"]),
        comp("Calabarzon", ["administrative_area_level_1", "political"]),
      ],
    } as unknown as google.maps.places.PlaceResult);
    expect(p.province).toBe("Cavite");
    expect(p.cityMunicipality).toBe("Bacoor");
  });

  it("Metro Manila 는 그대로 도 칸", () => {
    const p = parsePhFromGooglePlaceResult({
      address_components: [
        comp("Diliman", ["sublocality_level_1", "sublocality"]),
        comp("Quezon City", ["locality", "political"]),
        comp("Metro Manila", ["administrative_area_level_1", "political"]),
      ],
    } as unknown as google.maps.places.PlaceResult);
    expect(p.province).toBe("Metro Manila");
    expect(p.cityMunicipality).toBe("Quezon City");
    expect(p.barangay).toBe("Diliman");
  });

  it("locality 없으면 도(aal2)를 시/군으로 쓰지 않는다", () => {
    const p = parsePhFromGooglePlaceResult({
      address_components: [
        comp("Cavite", ["administrative_area_level_2", "political"]),
        comp("Calabarzon", ["administrative_area_level_1", "political"]),
      ],
    } as unknown as google.maps.places.PlaceResult);
    expect(p.cityMunicipality).toBeNull();
  });
});
