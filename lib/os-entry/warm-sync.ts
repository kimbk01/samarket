import {
  getOsEntryActiveRevisionSync,
  storeOsEntryLocalBundle,
} from "@/lib/os-entry/local-cache";
import { isOsEntryBundleComplete, normalizeOsEntryConfig } from "@/lib/os-entry/normalize";
import type { OsEntryConfig } from "@/lib/os-entry/types";

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read_failed"));
    };
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    if (blob.type.includes("gif")) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * Warm path only — never called from cold OsEntryOwner paint.
 * Atomic: incomplete image download does not replace active revision.
 */
export async function warmSyncOsEntryLive(): Promise<{
  ok: boolean;
  activeRevision: number;
  changed: boolean;
  reason?: string;
}> {
  const before = getOsEntryActiveRevisionSync();
  try {
    const revRes = await fetch("/api/app/os-entry?meta=1", {
      credentials: "omit",
      cache: "no-store",
    });
    if (!revRes.ok) {
      return { ok: false, activeRevision: before, changed: false, reason: "meta_http" };
    }
    const meta = (await revRes.json()) as {
      ok?: boolean;
      revision?: number;
    };
    if (!meta.ok || typeof meta.revision !== "number") {
      return { ok: false, activeRevision: before, changed: false, reason: "meta_shape" };
    }
    if (meta.revision <= 0 || meta.revision === before) {
      return { ok: true, activeRevision: before, changed: false };
    }

    const fullRes = await fetch("/api/app/os-entry", {
      credentials: "omit",
      cache: "no-store",
    });
    if (!fullRes.ok) {
      return { ok: false, activeRevision: before, changed: false, reason: "full_http" };
    }
    const full = (await fullRes.json()) as {
      ok?: boolean;
      config?: unknown;
    };
    if (!full.ok) {
      return { ok: false, activeRevision: before, changed: false, reason: "full_shape" };
    }
    const config = normalizeOsEntryConfig(full.config) as OsEntryConfig;
    if (config.revision !== meta.revision || !isOsEntryBundleComplete(config)) {
      return { ok: false, activeRevision: before, changed: false, reason: "incomplete" };
    }

    let imageDataUrl: string | null = null;
    if (config.imageUrl) {
      if (config.imageUrl.startsWith("/")) {
        imageDataUrl = await fetchImageDataUrl(config.imageUrl);
      } else {
        imageDataUrl = await fetchImageDataUrl(config.imageUrl);
      }
      if (!imageDataUrl && config.imageStoragePath) {
        // Remote image required for remote configs — keep previous live.
        return { ok: false, activeRevision: before, changed: false, reason: "image_missing" };
      }
    }

    const stored = storeOsEntryLocalBundle({
      revision: config.revision,
      config,
      imageDataUrl,
    });
    if (!stored) {
      return { ok: false, activeRevision: before, changed: false, reason: "store_reject" };
    }
    return { ok: true, activeRevision: config.revision, changed: true };
  } catch {
    return { ok: false, activeRevision: before, changed: false, reason: "exception" };
  }
}
