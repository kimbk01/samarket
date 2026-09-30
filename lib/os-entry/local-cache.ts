import { BUILT_IN_OS_ENTRY_CONFIG, OS_ENTRY_LOCAL_STORAGE_KEY } from "@/lib/os-entry/defaults";
import { isOsEntryBundleComplete, normalizeOsEntryConfig } from "@/lib/os-entry/normalize";
import type { OsEntryConfig, OsEntryLocalBundle } from "@/lib/os-entry/types";

let memoryBundle: OsEntryLocalBundle | null = null;

function readStorageRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(OS_ENTRY_LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorageRaw(json: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OS_ENTRY_LOCAL_STORAGE_KEY, json);
  } catch {
    /* quota — keep memory only */
  }
}

export function peekOsEntryLocalBundleSync(): OsEntryLocalBundle | null {
  if (memoryBundle) return memoryBundle;
  const raw = readStorageRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const config = normalizeOsEntryConfig(o.config ?? o);
    if (!isOsEntryBundleComplete(config)) return null;
    const imageDataUrl =
      typeof o.imageDataUrl === "string" && o.imageDataUrl.startsWith("data:")
        ? o.imageDataUrl
        : null;
    memoryBundle = {
      revision: config.revision,
      config,
      imageDataUrl,
    };
    return memoryBundle;
  } catch {
    return null;
  }
}

/** Cold entry: local active revision or built-in default. Never network. */
export function resolveOsEntryColdConfig(): {
  config: OsEntryConfig;
  imageSrc: string | null;
  source: "local" | "built_in";
} {
  const local = peekOsEntryLocalBundleSync();
  if (local && local.revision > 0 && isOsEntryBundleComplete(local.config)) {
    return {
      config: local.config,
      imageSrc: local.imageDataUrl ?? local.config.imageUrl,
      source: "local",
    };
  }
  return {
    config: { ...BUILT_IN_OS_ENTRY_CONFIG },
    imageSrc: BUILT_IN_OS_ENTRY_CONFIG.imageUrl,
    source: "built_in",
  };
}

export function storeOsEntryLocalBundle(bundle: OsEntryLocalBundle): boolean {
  if (!isOsEntryBundleComplete(bundle.config)) return false;
  if (bundle.revision <= 0) return false;
  const next: OsEntryLocalBundle = {
    revision: bundle.revision,
    config: normalizeOsEntryConfig(bundle.config),
    imageDataUrl: bundle.imageDataUrl,
  };
  memoryBundle = next;
  writeStorageRaw(JSON.stringify(next));
  return true;
}

export function getOsEntryActiveRevisionSync(): number {
  return peekOsEntryLocalBundleSync()?.revision ?? 0;
}

/** Test isolation only — not a product API. */
export function resetOsEntryLocalCacheForTests(): void {
  memoryBundle = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(OS_ENTRY_LOCAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
