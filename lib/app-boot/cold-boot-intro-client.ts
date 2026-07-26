"use client";

import {
  COLD_BOOT_INTRO_LOCAL_STORAGE_KEY,
  DEFAULT_COLD_BOOT_INTRO_CONFIG,
  normalizeColdBootIntroConfig,
  type ColdBootIntroConfig,
} from "@/lib/app-boot/cold-boot-intro-config";
import { DIBAY_COLD_BOOT_INTRO_DOM_ID } from "@/lib/app-boot/cold-boot-constants";

let memory: ColdBootIntroConfig = { ...DEFAULT_COLD_BOOT_INTRO_CONFIG };
let hydrateStarted = false;

function readCached(): ColdBootIntroConfig {
  if (typeof window === "undefined") return { ...DEFAULT_COLD_BOOT_INTRO_CONFIG };
  try {
    const raw = window.localStorage.getItem(COLD_BOOT_INTRO_LOCAL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLD_BOOT_INTRO_CONFIG };
    return normalizeColdBootIntroConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COLD_BOOT_INTRO_CONFIG };
  }
}

function writeCached(config: ColdBootIntroConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLD_BOOT_INTRO_LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

if (typeof window !== "undefined") {
  memory = readCached();
}

export function getColdBootIntroConfigCached(): ColdBootIntroConfig {
  memory = readCached();
  return { ...memory };
}

export function applyColdBootIntroConfigToDom(config: ColdBootIntroConfig): void {
  if (typeof document === "undefined") return;
  const root = document.getElementById(DIBAY_COLD_BOOT_INTRO_DOM_ID);
  if (!root) return;

  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? config.backgroundColorDark : config.backgroundColor;

  if (!config.enabled) {
    root.setAttribute("data-ready", "1");
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    return;
  }

  root.style.background = bg;
  root.removeAttribute("hidden");
  root.setAttribute("aria-hidden", "true");

  const logo = root.querySelector<HTMLImageElement>(".dibay-cold-boot-logo");
  if (logo && config.logoUrl) {
    if (logo.getAttribute("src") !== config.logoUrl) logo.src = config.logoUrl;
    logo.style.display = "";
  }

  const wordmark = root.querySelector<HTMLElement>(".dibay-cold-boot-wordmark");
  if (wordmark) {
    wordmark.textContent = config.wordmark;
    wordmark.style.display = config.showWordmark ? "" : "none";
  }

  const subtitle = root.querySelector<HTMLElement>(".dibay-cold-boot-subtitle");
  if (subtitle) {
    const text = config.subtitle.trim();
    subtitle.textContent = text;
    subtitle.style.display = text ? "" : "none";
  }

  const spinner = root.querySelector<HTMLElement>(".dibay-cold-boot-spinner");
  if (spinner) {
    spinner.style.display = config.showSpinner ? "" : "none";
  }
}

/**
 * After first paint — refresh remote config for *next* cold start.
 * Must never block App Ready.
 */
export function scheduleColdBootIntroConfigRefresh(): void {
  if (typeof window === "undefined") return;
  if (hydrateStarted) return;
  hydrateStarted = true;

  const run = () => {
    void (async () => {
      try {
        const res = await fetch("/api/app/cold-boot-intro", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!json?.ok) return;
        const next = normalizeColdBootIntroConfig(json.config);
        memory = next;
        writeCached(next);
        // Live apply only visual fields that do not flash away an almost-ready shell.
        // If already app-ready, leave DOM alone (intro already hidden).
      } catch {
        /* keep cached / default */
      }
    })();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

export function persistColdBootIntroConfigCache(config: ColdBootIntroConfig): void {
  memory = normalizeColdBootIntroConfig(config);
  writeCached(memory);
}
