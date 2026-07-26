/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COLD_BOOT_INTRO_CONFIG,
  normalizeColdBootIntroConfig,
} from "@/lib/app-boot/cold-boot-intro-config";
import { DIBAY_COLD_BOOT_INTRO_DOM_ID } from "@/lib/app-boot/cold-boot-constants";

describe("cold-boot-intro-config normalize", () => {
  it("returns bundled defaults for null/invalid", () => {
    expect(normalizeColdBootIntroConfig(null).wordmark).toBe(DEFAULT_COLD_BOOT_INTRO_CONFIG.wordmark);
    expect(normalizeColdBootIntroConfig({}).backgroundColor).toBe("#FFFCFC");
  });

  it("reads payload wrapper from admin_settings", () => {
    const cfg = normalizeColdBootIntroConfig({
      payload: {
        enabled: true,
        wordmark: "Season",
        subtitle: "Merry Christmas",
        backgroundColor: "#FFFCFC",
        backgroundColorDark: "#12161d",
        logoUrl: "/images/brand/dibay-app-icon-180.png",
        showSpinner: false,
        showWordmark: true,
      },
    });
    expect(cfg.wordmark).toBe("Season");
    expect(cfg.subtitle).toBe("Merry Christmas");
    expect(cfg.showSpinner).toBe(false);
  });

  it("rejects non-hex colors", () => {
    const cfg = normalizeColdBootIntroConfig({ backgroundColor: "red" });
    expect(cfg.backgroundColor).toBe("#FFFCFC");
  });
});

describe("cold-boot-intro-client cache + DOM apply", () => {
  beforeEach(() => {
    vi.resetModules();
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
        clear: () => {
          store.clear();
        },
      },
    });
    document.body.innerHTML = `
      <div id="${DIBAY_COLD_BOOT_INTRO_DOM_ID}">
        <img class="dibay-cold-boot-logo" src="/default.png" />
        <p class="dibay-cold-boot-wordmark">DIBAY</p>
        <p class="dibay-cold-boot-subtitle" style="display:none"></p>
        <div class="dibay-cold-boot-spinner"></div>
      </div>`;
  });

  it("applies cached config to DOM without network", async () => {
    const next = {
      ...DEFAULT_COLD_BOOT_INTRO_CONFIG,
      wordmark: "Cached",
      subtitle: "Holiday",
      showSpinner: false,
    };
    window.localStorage.setItem("dibay:cold-boot-intro:v1", JSON.stringify(next));
    const mod = await import("@/lib/app-boot/cold-boot-intro-client");
    const cfg = mod.getColdBootIntroConfigCached();
    expect(cfg.wordmark).toBe("Cached");
    mod.applyColdBootIntroConfigToDom(cfg);
    expect(document.querySelector(".dibay-cold-boot-wordmark")?.textContent).toBe("Cached");
    expect(document.querySelector(".dibay-cold-boot-subtitle")?.textContent).toBe("Holiday");
    expect((document.querySelector(".dibay-cold-boot-spinner") as HTMLElement).style.display).toBe(
      "none"
    );
  });

  it("hides intro immediately when enabled=false in cache", async () => {
    window.localStorage.setItem(
      "dibay:cold-boot-intro:v1",
      JSON.stringify({ ...DEFAULT_COLD_BOOT_INTRO_CONFIG, enabled: false })
    );
    const mod = await import("@/lib/app-boot/cold-boot-intro-client");
    mod.applyColdBootIntroConfigToDom(mod.getColdBootIntroConfigCached());
    const el = document.getElementById(DIBAY_COLD_BOOT_INTRO_DOM_ID);
    expect(el?.hasAttribute("hidden")).toBe(true);
  });
});
