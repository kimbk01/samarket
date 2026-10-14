import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withStoresBrowseFreshParam } from "@/lib/stores/stores-browse-fresh-query";

describe("withStoresBrowseFreshParam (PTR D13)", () => {
  it("adds fresh=1 as its own param without corrupting the last value", () => {
    const out = withStoresBrowseFreshParam("primary=food&sub=all");
    const sp = new URLSearchParams(out);
    expect(sp.get("sub")).toBe("all");
    expect(sp.get("fresh")).toBe("1");
    expect(out.startsWith("?")).toBe(false);
  });

  it("accepts a leading ? and keeps encoded values", () => {
    const sp = new URLSearchParams(withStoresBrowseFreshParam("?primary=food&city=Quezon%20City"));
    expect(sp.get("city")).toBe("Quezon City");
    expect(sp.get("fresh")).toBe("1");
  });

  it("does not duplicate fresh", () => {
    const sp = new URLSearchParams(withStoresBrowseFreshParam("primary=a&fresh=1"));
    expect(sp.getAll("fresh")).toEqual(["1"]);
  });
});

const fetchTaxonomy = vi.fn();
vi.mock("@/lib/stores/store-delivery-api-client", () => ({
  fetchStoresTaxonomyDeduped: (...args: unknown[]) => fetchTaxonomy(...args),
  peekStoresTaxonomyClientCache: () => null,
  purgeStoresTaxonomyNetworkCache: () => {},
}));
const parsePayload = vi.fn();
vi.mock("@/lib/stores/browse-taxonomy-resolvers", () => ({
  parseBrowseTaxonomyPayload: (json: unknown) => parsePayload(json),
}));

describe("reloadBrowseTaxonomySnapshot (PTR D14)", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchTaxonomy.mockReset();
    parsePayload.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function loadReady() {
    const mod = await import("@/lib/stores/browse-taxonomy-snapshot");
    const ready = { primaries: ["v1"] };
    fetchTaxonomy.mockResolvedValueOnce({ status: 200, json: { ok: true } });
    parsePayload.mockReturnValueOnce(ready);
    expect(await mod.reloadBrowseTaxonomySnapshot("ko")).toBe("success");
    expect(mod.getBrowseTaxonomySnapshot()).toBe(ready);
    return { mod, ready };
  }

  it("keeps the previous ready snapshot while reloading (no null flash)", async () => {
    const { mod, ready } = await loadReady();
    const seen: unknown[] = [];
    mod.subscribeBrowseTaxonomySnapshot(() => seen.push(mod.getBrowseTaxonomySnapshot()));
    let resolve!: (v: unknown) => void;
    fetchTaxonomy.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const p = mod.reloadBrowseTaxonomySnapshot("ko");
    await Promise.resolve();
    expect(mod.getBrowseTaxonomySnapshot()).toBe(ready);
    const next = { primaries: ["v2"] };
    parsePayload.mockReturnValueOnce(next);
    resolve({ status: 200, json: { ok: true } });
    expect(await p).toBe("success");
    expect(seen).not.toContain(null);
    expect(mod.getBrowseTaxonomySnapshot()).toBe(next);
  });

  it("network failure keeps previous ready snapshot and reports error", async () => {
    const { mod, ready } = await loadReady();
    fetchTaxonomy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await mod.reloadBrowseTaxonomySnapshot("ko")).toBe("error");
    expect(mod.getBrowseTaxonomySnapshot()).toBe(ready);
  });

  it("invalid payload keeps previous ready snapshot and reports error", async () => {
    const { mod, ready } = await loadReady();
    fetchTaxonomy.mockResolvedValueOnce({ status: 500, json: {} });
    parsePayload.mockReturnValueOnce(null);
    expect(await mod.reloadBrowseTaxonomySnapshot("ko")).toBe("error");
    expect(mod.getBrowseTaxonomySnapshot()).toBe(ready);
  });

  it("without a previous snapshot, failure becomes error state (null)", async () => {
    const mod = await import("@/lib/stores/browse-taxonomy-snapshot");
    fetchTaxonomy.mockRejectedValueOnce(new TypeError("x"));
    expect(await mod.reloadBrowseTaxonomySnapshot("ko")).toBe("error");
    expect(mod.getBrowseTaxonomySnapshot()).toBeNull();
  });
});
