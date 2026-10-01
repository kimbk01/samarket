/**
 * DIBAY Intro — DEVICE CACHED PUBLICATION (contract §4).
 *
 * - Index: one localStorage record, replaced with ONE setItem (atomic promotion).
 * - Assets: Cache Storage, keyed by sha256, written only after bytes + sha256 verified.
 * - A partial acquisition is never promoted, so it is never a launch candidate.
 * Key names avoid the R15 purge patterns (r15 / startup-presentation).
 */
import type {
  LaunchIntroAsset,
  LaunchIntroDocument,
  LaunchIntroEligibility,
  LaunchIntroLiveState,
} from "@/lib/launch-intro/document";
import { validateLaunchIntroDocument } from "@/lib/launch-intro/document";

export const LAUNCH_INTRO_INDEX_KEY = "dibay:launch-intro:index";
export const LAUNCH_INTRO_CACHE_NAME = "dibay-launch-intro-v1";
const INDEX_SCHEMA = 1;

export type LaunchIntroCachedPublication = {
  id: string;
  document: LaunchIntroDocument;
  assets: LaunchIntroAsset[];
  eligibility: LaunchIntroEligibility;
};

export type LaunchIntroIndex = {
  schema: typeof INDEX_SCHEMA;
  revision: number;
  state: LaunchIntroLiveState;
  /** Kept on pause / unpublish (state-only promotion); replaced only by a verified acquisition. */
  publication: LaunchIntroCachedPublication | null;
  promotedAt: string;
};

/**
 * Structural check + document normalization. Cached documents may be schema v1 (promoted before the
 * v2 runtime) or v2; both normalize through the one validator. Anything else is not a candidate.
 */
function parseIndex(v: unknown): LaunchIntroIndex | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.schema !== INDEX_SCHEMA) return null;
  if (typeof o.revision !== "number" || !Number.isFinite(o.revision)) return null;
  if (o.state !== "active" && o.state !== "paused" && o.state !== "unpublished") return null;
  const index = o as unknown as LaunchIntroIndex;
  if (o.publication == null) return { ...index, publication: null };
  const p = o.publication as Record<string, unknown>;
  if (typeof p.id !== "string" || !Array.isArray(p.assets)) return null;
  const doc = validateLaunchIntroDocument(p.document, "publication");
  if (!doc.ok) return null;
  return { ...index, publication: { ...(p as unknown as LaunchIntroCachedPublication), document: doc.document } };
}

/** Sync read. Corrupt / unknown schema → index removed, null (next discovery repairs). */
export function readLaunchIntroIndex(): LaunchIntroIndex | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LAUNCH_INTRO_INDEX_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = parseIndex(JSON.parse(raw) as unknown);
    if (parsed) return parsed;
  } catch {
    /* fall through */
  }
  try {
    window.localStorage.removeItem(LAUNCH_INTRO_INDEX_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

/** Atomic promotion: one setItem of the whole record. */
export function promoteLaunchIntroIndex(index: LaunchIntroIndex): boolean {
  try {
    window.localStorage.setItem(LAUNCH_INTRO_INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/** Invalidates the index after a local asset failure (contract §13). */
export function invalidateLaunchIntroIndex(): void {
  try {
    window.localStorage.removeItem(LAUNCH_INTRO_INDEX_KEY);
  } catch {
    /* ignore */
  }
}

function assetKey(sha256: string): string {
  return `${window.location.origin}/__dibay-launch-intro-asset/${sha256}`;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * ACQUISITION: downloads every asset, verifies bytes + sha256, stores it.
 * Returns false on any failure (nothing promoted; already-stored verified assets are harmless).
 */
export async function acquireLaunchIntroAssets(assets: Array<LaunchIntroAsset & { url: string }>): Promise<boolean> {
  if (typeof caches === "undefined" || !crypto?.subtle) return false;
  try {
    const cache = await caches.open(LAUNCH_INTRO_CACHE_NAME);
    for (const asset of assets) {
      const key = assetKey(asset.sha256);
      if (await cache.match(key)) continue;
      const res = await fetch(asset.url, { cache: "no-store" });
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== asset.bytes) return false;
      if ((await sha256Hex(buf)) !== asset.sha256) return false;
      await cache.put(
        key,
        new Response(new Blob([buf], { type: asset.mime }), {
          headers: { "content-type": asset.mime, "x-dibay-sha256": asset.sha256 },
        })
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Local only: verified cached asset → object URL. null when missing or mismatched. */
export async function loadLaunchIntroAssetUrl(asset: LaunchIntroAsset): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(LAUNCH_INTRO_CACHE_NAME);
    const res = await cache.match(assetKey(asset.sha256));
    if (!res) return null;
    const blob = await res.blob();
    if (blob.size !== asset.bytes) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** GC after promotion: keeps only the given sha256 set. */
export async function collectLaunchIntroAssetGarbage(keep: Set<string>): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(LAUNCH_INTRO_CACHE_NAME);
    for (const req of await cache.keys()) {
      const sha = req.url.split("/").pop() ?? "";
      if (!keep.has(sha)) await cache.delete(req);
    }
  } catch {
    /* ignore */
  }
}
