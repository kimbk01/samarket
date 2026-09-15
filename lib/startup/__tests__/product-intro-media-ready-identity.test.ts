import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  canShowProductIntroFromCache,
  writeProductIntroCache,
  writeProductIntroMediaReadyUrl,
} from "@/lib/startup/product-intro-cache";
import { normalizeProductIntroConfig } from "@/lib/startup/product-intro";

describe("product-intro media-ready URL identity", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", { localStorage: globalThis.localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not show when config URL and media-ready URL differ", () => {
    const cfg = normalizeProductIntroConfig({
      status: "active",
      media: { mobileUrl: "https://cdn.example/b.png", tabletUrl: null },
      displayDurationMs: 0,
    });
    writeProductIntroCache(cfg);
    writeProductIntroMediaReadyUrl("https://cdn.example/a.png");
    expect(canShowProductIntroFromCache(cfg).show).toBe(false);
  });

  it("shows when config URL and media-ready URL match", () => {
    const cfg = normalizeProductIntroConfig({
      status: "active",
      media: { mobileUrl: "https://cdn.example/b.png", tabletUrl: null },
      displayDurationMs: 0,
    });
    writeProductIntroCache(cfg);
    writeProductIntroMediaReadyUrl("https://cdn.example/b.png");
    const gate = canShowProductIntroFromCache(cfg);
    expect(gate.show).toBe(true);
    if (gate.show) expect(gate.mediaUrl).toBe("https://cdn.example/b.png");
  });
});
