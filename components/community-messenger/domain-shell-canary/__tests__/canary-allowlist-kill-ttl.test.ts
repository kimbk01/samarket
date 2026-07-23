/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_DOMAIN_READ_BUNDLE_KILL_TTL_MS,
  clearClientBundleKilled,
  isClientBundleKilled,
  markClientBundleKilled,
  readClientKilledBundles,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";

describe("client domain-read kill TTL", () => {
  afterEach(() => {
    clearClientBundleKilled();
  });

  it("marks killed within TTL", () => {
    const t0 = 1_000_000;
    markClientBundleKilled("store_order_customer", t0);
    expect(isClientBundleKilled("store_order_customer", t0 + 1_000)).toBe(true);
    expect(readClientKilledBundles(t0 + 1_000).has("store_order_customer")).toBe(true);
  });

  it("expires after TTL (mirrors server 45s)", () => {
    const t0 = 2_000_000;
    markClientBundleKilled("store_order_customer", t0);
    expect(
      isClientBundleKilled("store_order_customer", t0 + CLIENT_DOMAIN_READ_BUNDLE_KILL_TTL_MS)
    ).toBe(false);
  });

  it("drops legacy string[] kill entries (unknown age)", () => {
    sessionStorage.setItem(
      "samarket:domain-read-canary:killed-bundles.v1",
      JSON.stringify(["store_order_customer", "trade"])
    );
    expect(isClientBundleKilled("store_order_customer", Date.now())).toBe(false);
    expect(isClientBundleKilled("trade", Date.now())).toBe(false);
  });
});
