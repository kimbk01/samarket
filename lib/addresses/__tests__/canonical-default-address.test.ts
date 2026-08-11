import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCanonicalDefaultAddressSnapshotComplete,
  isCanonicalDefaultMasterPresent,
} from "@/lib/addresses/canonical-default-address";
import { userAddressInsertPayloadWithoutDefaultFlags } from "@/lib/addresses/user-address-service";
import { payloadToInsertRow } from "@/lib/addresses/user-address-mapper";
import { buildExplorationRegionSubtitleLine, buildTradePublicLine } from "@/lib/addresses/user-address-format";
import type { UserAddressWritePayload } from "@/lib/addresses/user-address-types";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

function addr(partial: Partial<UserAddressDTO> & { id: string }): UserAddressDTO {
  return {
    id: partial.id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: partial.province ?? "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Quezon City",
    barangay: partial.barangay ?? "Diliman",
    district: null,
    streetAddress: null,
    buildingName: partial.buildingName ?? null,
    unitFloorRoom: partial.unitFloorRoom ?? null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: partial.formattedAddress ?? "123 Sample St, Quezon City",
    roadAddress: null,
    detailAddress: partial.detailAddress ?? null,
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? null,
    neighborhoodName: partial.neighborhoodName ?? null,
    appRegionId: "ncr",
    appCityId: "quezon",
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: true,
    isDefaultTrade: true,
    isDefaultDelivery: true,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function writePayload(over: Partial<UserAddressWritePayload> = {}): UserAddressWritePayload {
  return {
    labelType: "home",
    nickname: "House",
    placeId: "ChIJtest",
    formattedAddress: "123 Sample St",
    latitude: 14.6,
    longitude: 120.98,
    detailAddress: "Unit 12",
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: true,
    isDefaultTrade: true,
    isDefaultDelivery: true,
    ...over,
  };
}

describe("canonical default address completeness", () => {
  it("profile geo only → ADDRESS_COMPLETE false", () => {
    expect(isCanonicalDefaultMasterPresent(null)).toBe(false);
    expect(isCanonicalDefaultMasterPresent({})).toBe(false);
    expect(isCanonicalDefaultMasterPresent({ master: null })).toBe(false);
  });

  it("region only / non-master address only → false; master active → true", () => {
    expect(
      isCanonicalDefaultAddressSnapshotComplete({
        ok: true,
        defaults: { master: null },
      }),
    ).toBe(false);
    expect(
      isCanonicalDefaultAddressSnapshotComplete({
        ok: true,
        defaults: { master: { id: "m1" } },
      }),
    ).toBe(true);
  });
});

describe("default address authority source", () => {
  it("list GET does not write master; gate is canonical master only; geo fallback removed", () => {
    const src = readFileSync(join(process.cwd(), "lib/addresses/user-address-service.ts"), "utf8");
    expect(src).not.toMatch(/assignFirstRowAsFullDefaultIfNoMaster/);
    expect(src).not.toMatch(/isProfileGeoAddressFallbackSatisfied/);
    expect(src).toMatch(/READ ONLY\. GET must not invent a master/);
    expect(src).toMatch(
      /export async function isMandatoryAddressGateSatisfied[\s\S]*return hasCanonicalDefaultMasterAddress/,
    );
    const listFn = src.slice(src.indexOf("export async function listUserAddresses"));
    const listBody = listFn.slice(0, listFn.indexOf("async function repairStoreLinkedMasterAfterWrite"));
    expect(listBody).not.toMatch(/\.update\(/);
    expect(listBody).not.toMatch(/repairStoreLinkedMasterWhenGeneralAddressExists/);
  });
});

describe("create insert does not carry default flags", () => {
  it("strips master/life/trade/delivery flags before INSERT", () => {
    const row = payloadToInsertRow("u1", userAddressInsertPayloadWithoutDefaultFlags(writePayload()));
    expect(row.is_default_master).toBe(false);
    expect(row.is_default_life).toBe(false);
    expect(row.is_default_trade).toBe(false);
    expect(row.is_default_delivery).toBe(false);
    expect(row.detail_address).toBe("Unit 12");
  });

  it("createUserAddress insert path uses flag-stripped payload", () => {
    const src = readFileSync(join(process.cwd(), "lib/addresses/user-address-service.ts"), "utf8");
    expect(src).toMatch(
      /payloadToInsertRow\(userId, userAddressInsertPayloadWithoutDefaultFlags\(pWithNick\)\)/,
    );
  });

  it("local_delivery order create requires detail_address snapshot", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(src).toMatch(/delivery_detail_address_required/);
    expect(src).toMatch(/deliveryAddressSnapshot\?\.detail_address/);
  });
});

describe("region display contract", () => {
  it("does not leak detail_address or 동/호수 on exploration/trade public lines", () => {
    const row = addr({
      id: "m1",
      formattedAddress: "Teheran-ro 123, Gangnam-gu, Seoul",
      roadAddress: "Teheran-ro 123, Gangnam-gu, Seoul",
      detailAddress: "101동 1203호",
      unitFloorRoom: "101동 1203호",
      buildingName: "Gangnam Station",
    });
    const region = buildExplorationRegionSubtitleLine(row) ?? "";
    const trade = buildTradePublicLine(row);
    expect(region).not.toMatch(/101동/);
    expect(region).not.toMatch(/1203호/);
    expect(trade).not.toMatch(/101동/);
    expect(trade).not.toMatch(/1203호/);
  });
});
