"use client";

import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import {
  readStartupConfigCache,
  writeStartupConfigCache,
} from "@/lib/startup/startup-cache";

let memory: StartupConfig = { ...BUNDLED_STARTUP_CONFIG };
let hydrateStarted = false;

if (typeof window !== "undefined") {
  memory = readStartupConfigCache();
}

export function getStartupConfigCached(): StartupConfig {
  memory = readStartupConfigCache();
  return { ...memory };
}

export function applyStartupConfigToDom(config: StartupConfig): void {
  if (typeof document === "undefined") return;
  const root = document.getElementById(DIBAY_STARTUP_INTRO_DOM_ID);
  if (!root) return;

  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = prefersDark ? config.backgroundColorDark : config.backgroundColor;

  if (config.forceDisable || !config.enabled) {
    root.setAttribute("data-ready", "1");
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    return;
  }

  root.style.background = bg;
  root.removeAttribute("hidden");
  root.setAttribute("aria-hidden", "true");

  const logo = root.querySelector<HTMLImageElement>(".dibay-startup-logo");
  if (logo) {
    const src =
      prefersDark && config.darkLogoUrl.trim() ? config.darkLogoUrl : config.logoUrl;
    if (src && logo.getAttribute("src") !== src) logo.src = src;
    logo.style.display = "";
  }

  const wordmark = root.querySelector<HTMLElement>(".dibay-startup-wordmark");
  if (wordmark) {
    wordmark.textContent = config.wordmark;
    wordmark.style.display = config.showWordmark ? "" : "none";
  }

  const subtitle = root.querySelector<HTMLElement>(".dibay-startup-subtitle");
  if (subtitle) {
    const text = config.subtitle.trim();
    subtitle.textContent = text;
    subtitle.style.display = text ? "" : "none";
  }

  const spinner = root.querySelector<HTMLElement>(".dibay-startup-spinner");
  if (spinner) {
    spinner.style.display = config.showSpinner ? "" : "none";
  }
}

/**
 * After first paint — refresh remote config for *next* cold start.
 * Must never block App Ready.
 */
export function scheduleStartupConfigRefresh(): void {
  if (typeof window === "undefined") return;
  if (hydrateStarted) return;
  hydrateStarted = true;

  const run = () => {
    void (async () => {
      try {
        const res = await fetch("/api/app/startup-config", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!json?.ok) return;
        const next = normalizeStartupConfig(json.config);
        memory = next;
        writeStartupConfigCache(next);
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

export function persistStartupConfigCache(config: StartupConfig): void {
  memory = normalizeStartupConfig(config);
  writeStartupConfigCache(memory);
}
