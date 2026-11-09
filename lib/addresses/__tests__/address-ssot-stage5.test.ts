/**
 * 주소 SSOT 5단계 (Owner 2026-11-09 「권장으로 진행」) — 전체 주소 1개·시/군 판정 1개·시/군 이름 1개·주문 재조회 제거.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { formatAddressBookLine, formatAddressBookLineSegments } from "@/lib/addresses/address-book-line";
import { formatUserAddressFull } from "@/lib/addresses/user-address-display-ssot";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import {
  addressDisplayPartsFromUserAddress,
  formatAddressFullLines,
  formatAddressFullOneLine,
} from "@/lib/addresses/address-display-levels";
import { resolveMemberCanonicalLguId } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";
import { resolveAddressCanonicalLguId } from "@/lib/addresses/address-location-ssot.server";
import { formatLguPublicDisplayName } from "@/lib/trade/location/national/lgu-public-display-name";
import { getTradeNationalLguDisplayNameById } from "@/lib/trade/location/national/lgu-display-by-id";
import { resolveTradeListingPublicCityLabel } from "@/lib/posts/post-listing-location-label";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const row = (r: Record<string, unknown>): UserAddressDTO => rowToUserAddressDTO({ id: "a1", user_id: "u1", ...r });

describe("전체 주소 = ③ 하나 (주소록·관리자·결제 같은 문장)", () => {
  const ra = row({
    building_name: "Ra Cafe",
    street_address: "Sct. Tuason Street",
    barangay: "Diliman",
    city_municipality: "Quezon City",
    province: "Metro Manila",
    canonical_lgu_id: "1381300000",
    unit_floor_room: "24k mansion",
    formatted_address: "Ra Cafe, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines",
  });
  it("주소록·관리자·결제가 같은 값", () => {
    const one = formatAddressFullOneLine(addressDisplayPartsFromUserAddress(ra));
    expect(one).toBe("24k mansion, Ra Cafe, Sct. Tuason Street, Diliman, Quezon City");
    expect(formatAddressBookLine(ra)).toBe(one);
    expect(formatUserAddressFull(ra)).toBe(one);
    const seg = formatAddressBookLineSegments(ra)!;
    expect(seg.detail).toBe("24k mansion");
    expect(seg.rest).toBe(toCheckoutDeliveryPayload(ra).summary_line);
  });
  it("같은 구간 반복·도 이름·우편번호 없음 (운영 행 형식)", () => {
    const r = row({
      unit_floor_room: "12355",
      street_address: "666",
      formatted_address: "666, Ermita, Manila, Ermita, Manila, Ermita, Manila, 1000 Metro Manila",
      canonical_lgu_id: "1380600000",
    });
    const seg = formatAddressBookLineSegments(r)!;
    expect(seg.plain).not.toMatch(/Metro Manila|1000/);
  });
  it("한국어 순서 한 줄 주소 — 국가·우편번호 구간 제거", () => {
    const r = row({ formatted_address: "필리핀 1008 Metro Manila, Manila, Tondo, 메트로폴리탄 메디컬 센터" });
    const f = formatAddressFullLines(addressDisplayPartsFromUserAddress(r));
    expect(f.main).toBe("Manila, Tondo, 메트로폴리탄 메디컬 센터");
  });
  it("번지는 지우지 않는다", () => {
    const r = row({ formatted_address: "1001 Paterno St, Quiapo, Manila, 1001 Metro Manila", canonical_lgu_id: "1380600000" });
    expect(formatAddressFullLines(addressDisplayPartsFromUserAddress(r)).main).toBe("1001 Paterno St, Quiapo, Manila");
  });
  it("한글 자모 세부 중복 1회", () => {
    const r = row({ unit_floor_room: "ㄱㄷㄷㄱ", detail_address: "ㄱㄷㄷㄱ", formatted_address: "Tagaytay City" });
    expect(formatAddressFullLines(addressDisplayPartsFromUserAddress(r)).detail).toBe("ㄱㄷㄷㄱ");
  });
});

describe("시/군 판정 = 주소 SSOT 하나 (배달 포함)", () => {
  it.each([
    [{ cityMunicipality: "Diliman", province: "Quezon City" }, "1381300000"],
    [{ cityMunicipality: "Cainta", province: "Calabarzon" }, "0405805000"],
    [{ cityMunicipality: "Quezon City", province: "Metro Manila" }, "1381300000"],
    [{ canonicalLguId: "0402103000", cityMunicipality: "x" }, "0402103000"],
  ])("%o → %s (배달 = 주소)", (input, want) => {
    expect(resolveAddressCanonicalLguId(input)).toBe(want);
    expect(resolveMemberCanonicalLguId(input)).toBe(want);
  });
  it("거래 글쓰기 화면은 주소 행 LGU 를 쓴다(다시 판정 API 없음)", () => {
    const src = read("components/write/shared/TradeDefaultLocationBlock.tsx");
    expect(src).not.toContain("/api/trade/national-lgu");
    expect(src).toContain("addr.canonicalLguId");
  });
  it("배달 시간 경로도 주소 SSOT 판정", () => {
    expect(read("app/api/stores/[slug]/delivery-eta/route.ts")).toContain("deriveAddressLocation(rowToUserAddressDTO(");
  });
});

describe("시/군 이름 하나 — 「X City」", () => {
  it("City of X → X City", () => {
    expect(formatLguPublicDisplayName("City of Bacoor")).toBe("Bacoor City");
    expect(formatLguPublicDisplayName("Quezon City")).toBe("Quezon City");
    expect(formatLguPublicDisplayName("Cainta")).toBe("Cainta");
  });
  it("거래 카드·전국 데이터 이름도 같은 형식", () => {
    expect(getTradeNationalLguDisplayNameById("0402103000")).toBe("Bacoor City");
    expect(resolveTradeListingPublicCityLabel({ tradeLguId: "0402103000" })).toBe("Bacoor City");
    expect(resolveTradeListingPublicCityLabel({ tradeLguId: "1380600000" })).toBe("Manila City");
  });
});

describe("L5 — 주문은 대표 주소 행을 다시 읽지 않는다", () => {
  it("대표 주소 행으로 배달지 스냅샷", () => {
    const src = read("app/api/me/store-orders/route.ts");
    expect(src).toContain("deliveryMasterRow?.id === deliveryUserAddressId");
    expect(src).toContain("canonical_lgu_id: m.canonicalLguId ?? null");
  });
});

describe("인덱스 마이그레이션", () => {
  it("대표 주소 LGU 부분 인덱스", () => {
    const sql = read("supabase/migrations/20271109160000_address_ssot_user_addresses_master_lgu_index.sql");
    expect(sql).toContain("(canonical_lgu_id, user_id)");
    expect(sql).toContain("where (is_active and is_default_master)");
  });
});
