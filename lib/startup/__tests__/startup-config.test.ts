/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  isStartupIntroActive,
} from "@/lib/startup/startup-config";
import {
  applyStartupConfigToDom,
  getStartupConfigCached,
  persistStartupConfigCache,
} from "@/lib/startup/startup-config-client";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import { buildStartupBootDocumentHtml, buildStartupIntroMarkup } from "@/lib/startup/startup-shell-markup";

describe("normalizeStartupConfig", () => {
  it("returns bundled defaults for null", () => {
    expect(normalizeStartupConfig(null)).toEqual(BUNDLED_STARTUP_CONFIG);
  });

  it("accepts nested payload", () => {
    const next = normalizeStartupConfig({
      payload: { wordmark: "HELLO", enabled: false, forceDisable: true },
    });
    expect(next.wordmark).toBe("HELLO");
    expect(next.enabled).toBe(false);
    expect(next.forceDisable).toBe(true);
    expect(isStartupIntroActive(next)).toBe(false);
  });

  it("clamps invalid colors", () => {
    const next = normalizeStartupConfig({ backgroundColor: "red" });
    expect(next.backgroundColor).toBe(BUNDLED_STARTUP_CONFIG.backgroundColor);
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
    document.body.innerHTML = `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}">
      <img class="dibay-startup-logo" src="/a.png" />
      <p class="dibay-startup-wordmark">DIBAY</p>
      <p class="dibay-startup-subtitle"></p>
      <div class="dibay-startup-spinner"></div>
    </div>`;
  });

  it("persists and reads cache", () => {
    persistStartupConfigCache({
      ...BUNDLED_STARTUP_CONFIG,
      wordmark: "NEXT",
      updatedAt: new Date().toISOString(),
    });
    expect(getStartupConfigCached().wordmark).toBe("NEXT");
  });

  it("applies config to DOM", () => {
    applyStartupConfigToDom({
      ...BUNDLED_STARTUP_CONFIG,
      enabled: true,
      forceDisable: false,
      wordmark: "APPLIED",
      subtitle: "hi",
      showSpinner: false,
    });
    expect(document.querySelector(".dibay-startup-wordmark")?.textContent).toBe("APPLIED");
    expect((document.querySelector(".dibay-startup-subtitle") as HTMLElement).style.display).not.toBe(
      "none"
    );
    expect((document.querySelector(".dibay-startup-spinner") as HTMLElement).style.display).toBe("none");
  });

  it("normalizes initialSurface enum", () => {
    expect(normalizeStartupConfig({ initialSurface: "trade" }).initialSurface).toBe("trade");
    expect(normalizeStartupConfig({ initial_surface: "food" }).initialSurface).toBe("food");
    expect(normalizeStartupConfig({ initialSurface: "nope" }).initialSurface).toBe("community");
  });
});

describe("startup-shell-markup", () => {
  it("builds self-contained boot document with single location.replace and handoff cover", () => {
    const html = buildStartupBootDocumentHtml({
      logoSrc: "data:image/png;base64,AAA",
      remoteOrigin: "https://samarket.vercel.app",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("dibay-startup-nav");
    expect(html).toContain(DIBAY_STARTUP_INTRO_DOM_ID);
    expect(html).toContain("location.replace");
    expect(html.match(/location\.replace/g)?.length).toBe(1);
    expect(html).toContain("beginHandoffCover");
    expect(html).toContain("hideIntroShowShell");
    expect(html).toContain("requestAnimationFrame");
    expect(html).not.toContain("src=\"http");
  });

  it("builds intro markup for remote layout when explicitly enabled", () => {
    const frag = buildStartupIntroMarkup({
      logoSrc: "/images/brand/x.png",
      config: { ...BUNDLED_STARTUP_CONFIG, enabled: true, forceDisable: false },
    });
    expect(frag).toContain(DIBAY_STARTUP_INTRO_DOM_ID);
    expect(frag).toContain("/images/brand/x.png");
  });

  it("builds hidden intro stub when web intro disabled (product default)", () => {
    const frag = buildStartupIntroMarkup({ logoSrc: "/images/brand/x.png" });
    expect(frag).toContain(DIBAY_STARTUP_INTRO_DOM_ID);
    expect(frag).toContain("hidden");
    expect(frag).not.toContain("/images/brand/x.png");
  });
});
