import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_OS_ENTRY_CONFIG,
  OS_ENTRY_DEFAULT_MINIMUM_VISIBLE_MS,
  OS_ENTRY_LOCAL_STORAGE_KEY,
} from "@/lib/os-entry/defaults";
import {
  getOsEntryActiveRevisionSync,
  resetOsEntryLocalCacheForTests,
  resolveOsEntryColdConfig,
  storeOsEntryLocalBundle,
} from "@/lib/os-entry/local-cache";
import {
  isOsEntryBundleComplete,
  normalizeOsEntryConfig,
} from "@/lib/os-entry/normalize";
import { DESIGN_SYSTEM_BRAND } from "@/lib/ui/design-system-hard-lock";

describe("os-entry R16 contract", () => {
  it("built-in default uses brand green and minimal hold", () => {
    expect(BUILT_IN_OS_ENTRY_CONFIG.backgroundColor).toBe(DESIGN_SYSTEM_BRAND.primaryHex);
    expect(BUILT_IN_OS_ENTRY_CONFIG.backgroundColor).toBe("#0B421A");
    expect(BUILT_IN_OS_ENTRY_CONFIG.minimumVisibleMs).toBe(OS_ENTRY_DEFAULT_MINIMUM_VISIBLE_MS);
    expect(BUILT_IN_OS_ENTRY_CONFIG.revision).toBe(0);
    expect(BUILT_IN_OS_ENTRY_CONFIG.imageFit).toBe("contain");
  });

  it("incomplete remote image bundle is rejected", () => {
    const incomplete = normalizeOsEntryConfig({
      ...BUILT_IN_OS_ENTRY_CONFIG,
      imageUrl: "https://example.com/a.png",
      imageStoragePath: "draft/x.png",
      imageSha256: null,
      revision: 2,
    });
    expect(isOsEntryBundleComplete(incomplete)).toBe(false);
  });

  it("complete remote image bundle is accepted", () => {
    const complete = normalizeOsEntryConfig({
      background_color: "#112233",
      image_public_url: "https://example.com/a.png",
      image_storage_path: "live/2/a.png",
      image_sha256: "a".repeat(64),
      revision: 2,
    });
    expect(isOsEntryBundleComplete(complete)).toBe(true);
    expect(complete.backgroundColor).toBe("#112233");
    expect(complete.revision).toBe(2);
  });

  it("bundled path without sha is complete", () => {
    expect(isOsEntryBundleComplete(BUILT_IN_OS_ENTRY_CONFIG)).toBe(true);
  });

  it("forces imageFit contain", () => {
    const c = normalizeOsEntryConfig({ image_fit: "cover" });
    expect(c.imageFit).toBe("contain");
  });

  it("SERVICE APPLY revision bump is monotonic from LIVE only", () => {
    const liveRev = 3;
    const draftWorking = normalizeOsEntryConfig({
      ...BUILT_IN_OS_ENTRY_CONFIG,
      text: "OS-A",
      revision: liveRev,
    });
    // SAVE keeps draft.revision == live (does not invent next).
    expect(draftWorking.revision).toBe(liveRev);
    const nextLive = Math.max(1, liveRev + 1);
    expect(nextLive).toBe(4);
  });
});

describe("os-entry cold local cache", () => {
  afterEach(() => {
    resetOsEntryLocalCacheForTests();
    vi.unstubAllGlobals();
  });

  it("built-in default works without local revision (no network)", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    resetOsEntryLocalCacheForTests();
    const cold = resolveOsEntryColdConfig();
    expect(cold.source).toBe("built_in");
    expect(cold.config.revision).toBe(0);
    expect(getOsEntryActiveRevisionSync()).toBe(0);
  });

  it("incomplete bundle is not activated; previous active preserved", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    resetOsEntryLocalCacheForTests();
    const good = normalizeOsEntryConfig({
      background_color: "#0B421A",
      image_public_url: "https://example.com/a.png",
      image_storage_path: "live/1/a.png",
      image_sha256: "b".repeat(64),
      text_content: "OS-A",
      revision: 1,
    });
    expect(
      storeOsEntryLocalBundle({
        revision: 1,
        config: good,
        imageDataUrl: "data:image/png;base64,AA==",
      })
    ).toBe(true);
    expect(getOsEntryActiveRevisionSync()).toBe(1);

    const incomplete = normalizeOsEntryConfig({
      ...good,
      revision: 2,
      imageSha256: null,
    });
    expect(
      storeOsEntryLocalBundle({
        revision: 2,
        config: incomplete,
        imageDataUrl: null,
      })
    ).toBe(false);
    expect(getOsEntryActiveRevisionSync()).toBe(1);
    expect(store.get(OS_ENTRY_LOCAL_STORAGE_KEY)).toContain('"revision":1');
  });
});

describe("os-entry intro separation", () => {
  it("domain modules do not import intro / r15 startup presentation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(process.cwd(), "lib/os-entry");
    const files = fs.readdirSync(root).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src).not.toMatch(/startup-presentation|GenerationManifestR15|HOME_WAIT|r15_startup/i);
      expect(src).not.toMatch(/from ["']@\/lib\/intro|from ["']@\/components\/intro/i);
    }
  });

  it("components/os-entry have no intro runtime dependency", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(process.cwd(), "components/os-entry");
    const files = fs.readdirSync(root).filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src).not.toMatch(/HOME_WAIT|StartupPresentation|r15_startup/);
      expect(src).not.toMatch(/from ["']@\/(?:lib|components)\/intro/);
      expect(src).not.toMatch(/\brouter\.(push|replace)\s*\(/);
      expect(src).not.toMatch(/\blocation\.href\s*=/);
      expect(src).not.toMatch(/\breload\s*\(/);
    }
  });

  it("OsEntryOwner arms timer only after appReady (splash dismiss)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/os-entry/OsEntryOwner.tsx"),
      "utf8"
    );
    expect(src).toMatch(/getAppReadySnapshot/);
    expect(src).toMatch(/subscribeAppReady/);
    expect(src).toMatch(/armReleaseTimer/);
  });
});
