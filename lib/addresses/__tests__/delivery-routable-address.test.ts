import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isDeliveryRoutableCoords,
  isDeliveryRoutableMasterAddress,
} from "@/lib/addresses/delivery-routable-address";
import {
  isCanonicalDefaultAddressSnapshotComplete,
  isCanonicalDefaultMasterPresent,
} from "@/lib/addresses/canonical-default-address";

describe("CUT 5 DELIVERY_ROUTABLE", () => {
  it("separates ADDRESS_COMPLETE from DELIVERY_ROUTABLE", () => {
    expect(
      isCanonicalDefaultAddressSnapshotComplete({
        ok: true,
        defaults: { master: { id: "m1", latitude: null, longitude: null } },
      }),
    ).toBe(true);
    expect(
      isDeliveryRoutableMasterAddress({
        id: "m1",
        latitude: null,
        longitude: null,
      }),
    ).toBe(false);
    expect(isCanonicalDefaultMasterPresent({ master: { id: "m1" } })).toBe(true);
  });

  it("valid master coords → routable", () => {
    expect(isDeliveryRoutableCoords(14.55, 121.03)).toBe(true);
    expect(
      isDeliveryRoutableMasterAddress({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        latitude: 14.55,
        longitude: 121.03,
      }),
    ).toBe(true);
  });

  it("rejects null/NaN/empty/out-of-range/null-island", () => {
    expect(isDeliveryRoutableCoords(null, null)).toBe(false);
    expect(isDeliveryRoutableCoords(undefined, undefined)).toBe(false);
    expect(isDeliveryRoutableCoords("", "")).toBe(false);
    expect(isDeliveryRoutableCoords(Number.NaN, 121)).toBe(false);
    expect(isDeliveryRoutableCoords(14.55, Number.NaN)).toBe(false);
    expect(isDeliveryRoutableCoords(91, 121)).toBe(false);
    expect(isDeliveryRoutableCoords(14.55, 181)).toBe(false);
    expect(isDeliveryRoutableCoords(0, 0)).toBe(false);
    expect(isDeliveryRoutableCoords("not-a-number", "121")).toBe(false);
  });

  it("requires address id; inactive fails", () => {
    expect(
      isDeliveryRoutableMasterAddress({
        id: "",
        latitude: 14.55,
        longitude: 121.03,
      }),
    ).toBe(false);
    expect(
      isDeliveryRoutableMasterAddress({
        id: "m1",
        latitude: 14.55,
        longitude: 121.03,
        isActive: false,
      }),
    ).toBe(false);
  });

  it("ADDRESS_COMPLETE predicate ignores coordinates", () => {
    expect(
      isCanonicalDefaultAddressSnapshotComplete({
        ok: true,
        defaults: { master: { id: "m1", latitude: null } },
      }),
    ).toBe(true);
    const src = readFileSync(
      join(process.cwd(), "lib/addresses/canonical-default-address.ts"),
      "utf8",
    );
    expect(src).toContain("ADDRESS_COMPLETE =");
    expect(src).not.toContain("isDeliveryRoutable");
  });

  it("MandatoryAddressGate still uses ADDRESS_COMPLETE only", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/addresses/user-address-service.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /export async function isMandatoryAddressGateSatisfied[\s\S]*return hasCanonicalDefaultMasterAddress/,
    );
  });

  it("Delivery consumer layout mounts DeliveryRoutableAddressGate", () => {
    const shell = readFileSync(
      join(process.cwd(), "components/delivery/navigation/StoresDeliveryLayoutShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("DeliveryRoutableAddressGate");
    const gate = readFileSync(
      join(process.cwd(), "components/addresses/DeliveryRoutableAddressGate.tsx"),
      "utf8",
    );
    expect(gate).toContain("buildMypageAddressesHrefFromPath");
    expect(gate).toContain("isDeliveryRoutableMasterAddress");
    expect(gate).not.toContain("tryBrowserGeolocation");
    expect(gate).not.toContain("profiles.latitude");
  });

  it("server member origin does not fall through to explicit GPS coords", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/store-list-delivery-origin.ts"),
      "utf8",
    );
    expect(src).toContain("isDeliveryRoutableMasterAddress");
    expect(src).toContain("Do not fall through to query GPS");
    const fn = src.slice(src.indexOf("export async function resolveStoreListDeliveryOrigin"));
    expect(fn).toMatch(/if \(userId\)[\s\S]*return noneOrigin\(userId\)/);
  });

  it("Community/Market catalogs untouched by this predicate file", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/addresses/delivery-routable-address.ts"),
      "utf8",
    );
    expect(src).toContain("Community / Market / MandatoryAddressGate");
    expect(src).toContain("ADDRESS_COMPLETE");
  });
});
