"use client";

import type { GenerationManifestR15 } from "@/lib/startup-presentation/document";
import { stableStringify } from "@/lib/startup-presentation/document";

const DB_NAME = "dibay-r15-startup-presentation";
const DB_VERSION = 1;
const MANIFEST_STORE = "manifests";
const ASSET_STORE = "assets";
const POINTER_STORE = "pointers";
const ACTIVE_POINTER_KEY = "activeGenerationId";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE);
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
      if (!db.objectStoreNames.contains(POINTER_STORE)) db.createObjectStore(POINTER_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_open_failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
  });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_get_failed"));
  });
}

async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadActiveStartupGenerationR15(): Promise<GenerationManifestR15 | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction([POINTER_STORE, MANIFEST_STORE], "readonly");
    const activeId = await idbGet<string>(tx.objectStore(POINTER_STORE), ACTIVE_POINTER_KEY);
    if (!activeId) return null;
    return (await idbGet<GenerationManifestR15>(tx.objectStore(MANIFEST_STORE), activeId)) ?? null;
  } finally {
    db.close();
  }
}

export async function loadStartupAssetBlobUrlR15(
  generationId: string,
  assetId: string | null | undefined
): Promise<string | null> {
  if (!assetId || typeof indexedDB === "undefined" || typeof URL === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction(ASSET_STORE, "readonly");
    const blob = await idbGet<Blob>(tx.objectStore(ASSET_STORE), `${generationId}:${assetId}`);
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    db.close();
  }
}

export async function warmStageStartupGenerationR15(
  manifest: GenerationManifestR15
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof indexedDB === "undefined") return { ok: false, error: "indexeddb_unavailable" };
  try {
    const manifestBody = {
      schemaVersion: manifest.schemaVersion,
      generationId: manifest.generationId,
      documentHash: manifest.documentHash,
      document: manifest.document,
      assetManifest: manifest.assetManifest,
      createdAt: manifest.createdAt,
      publishedAt: manifest.publishedAt,
    };
    const manifestHash = await sha256Hex(stableStringify(manifestBody));
    if (manifestHash !== manifest.integrity.manifestHash) {
      return { ok: false, error: "manifest_hash_mismatch" };
    }
    const documentHash = await sha256Hex(stableStringify(manifest.document));
    if (documentHash !== manifest.documentHash) {
      return { ok: false, error: "document_hash_mismatch" };
    }

    const assetBlobs = new Map<string, Blob>();
    for (const asset of manifest.assetManifest) {
      const res = await fetch(asset.publicUrl, { cache: "no-store", credentials: "omit" });
      if (!res.ok) return { ok: false, error: `asset_fetch_failed:${asset.assetId}` };
      const blob = await res.blob();
      const bytes = await blob.arrayBuffer();
      if (bytes.byteLength !== asset.byteLength) {
        return { ok: false, error: `asset_size_mismatch:${asset.assetId}` };
      }
      const hash = await sha256Hex(bytes);
      if (hash !== asset.sha256) {
        return { ok: false, error: `asset_hash_mismatch:${asset.assetId}` };
      }
      assetBlobs.set(asset.assetId, blob);
    }

    const db = await openDb();
    try {
      const tx = db.transaction([MANIFEST_STORE, ASSET_STORE, POINTER_STORE], "readwrite");
      tx.objectStore(MANIFEST_STORE).put(manifest, manifest.generationId);
      for (const [assetId, blob] of assetBlobs) {
        tx.objectStore(ASSET_STORE).put(blob, `${manifest.generationId}:${assetId}`);
      }
      // Active pointer moves last in the same transaction after all verified writes.
      tx.objectStore(POINTER_STORE).put(manifest.generationId, ACTIVE_POINTER_KEY);
      await txDone(tx);
    } finally {
      db.close();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "stage_failed" };
  }
}

export async function discoverAndPromoteLatestStartupGenerationR15(): Promise<void> {
  try {
    const res = await fetch("/api/app/startup-presentation/latest", {
      cache: "no-store",
      credentials: "omit",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { ok?: boolean; manifest?: GenerationManifestR15 };
    if (!json.ok || !json.manifest) return;
    await warmStageStartupGenerationR15(json.manifest);
  } catch {
    /* warm distribution is best-effort; cold start keeps current active/bootstrap */
  }
}
