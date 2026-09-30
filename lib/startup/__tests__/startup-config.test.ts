/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  isStartupIntroActive,
  toNativeStartupConfigPayload,
} from "@/lib/startup/startup-config";
import {
  applyStartupConfigToDom,
  getStartupConfigCached,
  persistStartupConfigCache,
} from "@/lib/startup/startup-config-client";

describe("normalizeStartupConfig", () => {
  it("returns bundled defaults for null", () => {
    expect(normalizeStartupConfig(null)).toEqual(BUNDLED_STARTUP_CONFIG);
  });

  it("strips Intro-shaped fields from nested payload", () => {
    const next = normalizeStartupConfig({
      payload: {
        wordmark: "HELLO",
        enabled: true,
        forceDisable: false,
        logoUrl: "https://cdn.example/logo.png",
        backgroundColor: "#FF0000",
        initialSurface: "trade",
      },
    });
    expect(next).toEqual({
      version: 2,
      initialSurface: "trade",
      updatedAt: expect.any(String),
    });
    expect("wordmark" in next).toBe(false);
    expect("logoUrl" in next).toBe(false);
    expect("backgroundColor" in next).toBe(false);
    expect("enabled" in next).toBe(false);
    expect(isStartupIntroActive(next)).toBe(false);
  });

  it("ignores invalid presentation colors without rehydrating them", () => {
    const next = normalizeStartupConfig({ backgroundColor: "red" });
    expect("backgroundColor" in next).toBe(false);
    expect(next.initialSurface).toBe(BUNDLED_STARTUP_CONFIG.initialSurface);
  });
});

describe("startup config client cache", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    });
    document.body.innerHTML = `<div id="dibay-startup-root"></div>`;
  });

  it("persists and reads boot-only cache", () => {
    persistStartupConfigCache({
      ...BUNDLED_STARTUP_CONFIG,
      initialSurface: "trade",
      updatedAt: new Date().toISOString(),
    });
    expect(getStartupConfigCached().initialSurface).toBe("trade");
    expect("wordmark" in getStartupConfigCached()).toBe(false);
  });

  it("applyStartupConfigToDom is a no-op (no Intro DOM ownership)", () => {
    applyStartupConfigToDom({
      ...BUNDLED_STARTUP_CONFIG,
      initialSurface: "food",
    });
    expect(document.getElementById("dibay-startup-intro")).toBeNull();
    expect(document.body.innerHTML).toContain("dibay-startup-root");
  });

  it("normalizes initialSurface enum", () => {
    expect(normalizeStartupConfig({ initialSurface: "trade" }).initialSurface).toBe("trade");
    expect(normalizeStartupConfig({ initial_surface: "food" }).initialSurface).toBe("food");
    expect(normalizeStartupConfig({ initialSurface: "nope" }).initialSurface).toBe("community");
  });

  it("native payload contains only boot authority", () => {
    const next = normalizeStartupConfig({
      logo: { source: "uploaded", url: "https://cdn.example/logo.png" },
      background: { type: "gradient", color: "#FFFCFC" },
      introAnimation: { enter: "scale_in", exit: "fade_out" },
      initialSurface: "chat",
    });
    const native = toNativeStartupConfigPayload(next);
    expect(native).toEqual({
      version: 2,
      initialSurface: "chat",
      updatedAt: expect.any(String),
    });
    expect(native.logoUrl).toBeUndefined();
    expect(native.enterAnimation).toBeUndefined();
    expect(native.backgroundType).toBeUndefined();
    expect(isStartupIntroActive(next)).toBe(false);
  });
});

describe("startup intro authority (R15 ZERO)", () => {
  it("never activates Intro presentation", () => {
    expect(isStartupIntroActive(BUNDLED_STARTUP_CONFIG)).toBe(false);
    expect(
      isStartupIntroActive({
        ...BUNDLED_STARTUP_CONFIG,
        // @ts-expect-error — Intro fields must not exist on boot type
        enabled: true,
        forceDisable: false,
      })
    ).toBe(false);
  });
});
