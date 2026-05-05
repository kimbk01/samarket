import { BROWSE_PRIMARY_INDUSTRIES, BROWSE_SUB_INDUSTRIES } from "./mock-store-categories";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "./types";

const STORAGE_KEY = "kasama-browse-industry-overrides-v1";

export type BrowseIndustryOverridesPayload = {
  addedPrimaries: BrowsePrimaryIndustry[];
  addedSubs: BrowseSubIndustry[];
  /** 기본(코드) 업종 수정 오버라이드 */
  patchedPrimaries?: Partial<BrowsePrimaryIndustry & { id: string }>[];
  patchedSubs?: Partial<BrowseSubIndustry & { id: string }>[];
  /** 기본(코드) 업종 숨김(삭제) 오버라이드 */
  removedPrimaryIds?: string[];
  removedSubIds?: string[];
};

const EMPTY: BrowseIndustryOverridesPayload = { addedPrimaries: [], addedSubs: [] };

function parsePayload(raw: string | null): BrowseIndustryOverridesPayload {
  if (!raw) return { ...EMPTY, addedPrimaries: [], addedSubs: [] };
  try {
    const p = JSON.parse(raw) as BrowseIndustryOverridesPayload;
    return {
      addedPrimaries: Array.isArray(p.addedPrimaries) ? p.addedPrimaries : [],
      addedSubs: Array.isArray(p.addedSubs) ? p.addedSubs : [],
      patchedPrimaries: Array.isArray(p.patchedPrimaries) ? p.patchedPrimaries : [],
      patchedSubs: Array.isArray(p.patchedSubs) ? p.patchedSubs : [],
      removedPrimaryIds: Array.isArray(p.removedPrimaryIds) ? p.removedPrimaryIds : [],
      removedSubIds: Array.isArray(p.removedSubIds) ? p.removedSubIds : [],
    };
  } catch {
    return { ...EMPTY, addedPrimaries: [], addedSubs: [] };
  }
}

export function getBrowseIndustryOverrides(): BrowseIndustryOverridesPayload {
  if (typeof window === "undefined") return { addedPrimaries: [], addedSubs: [] };
  return parsePayload(localStorage.getItem(STORAGE_KEY));
}

export function persistBrowseIndustryOverrides(payload: BrowseIndustryOverridesPayload): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  notifyBrowseIndustryListeners();
  try {
    ensureChannel()?.postMessage({ t: Date.now() });
  } catch {
    // ignore
  }
}

let listenerVersion = 0;
const listeners = new Set<() => void>();
let storageListenerAttached = false;
let channelListenerAttached = false;
let channel: BroadcastChannel | null = null;

function handleStorageEvent(e: StorageEvent): void {
  try {
    if (e.key !== STORAGE_KEY) return;
    notifyBrowseIndustryListeners();
  } catch {
    // ignore
  }
}

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  try {
    if (channel) return channel;
    channel = new BroadcastChannel("kasama-browse-industry-overrides");
    return channel;
  } catch {
    return null;
  }
}

function handleChannelMessage(): void {
  notifyBrowseIndustryListeners();
}

export function subscribeBrowseIndustryListeners(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined" && !storageListenerAttached) {
    storageListenerAttached = true;
    window.addEventListener("storage", handleStorageEvent);
  }
  if (typeof window !== "undefined" && !channelListenerAttached) {
    const ch = ensureChannel();
    if (ch) {
      channelListenerAttached = true;
      ch.addEventListener("message", handleChannelMessage);
    }
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && storageListenerAttached && typeof window !== "undefined") {
      storageListenerAttached = false;
      window.removeEventListener("storage", handleStorageEvent);
    }
    if (listeners.size === 0 && channelListenerAttached) {
      const ch = ensureChannel();
      if (ch) {
        channelListenerAttached = false;
        ch.removeEventListener("message", handleChannelMessage);
      }
    }
  };
}

export function getBrowseIndustryListenerVersion(): number {
  return listenerVersion;
}

function notifyBrowseIndustryListeners(): void {
  listenerVersion += 1;
  listeners.forEach((l) => l());
}

export function clearBrowseIndustryOverrides(): void {
  persistBrowseIndustryOverrides({
    addedPrimaries: [],
    addedSubs: [],
    patchedPrimaries: [],
    patchedSubs: [],
    removedPrimaryIds: [],
    removedSubIds: [],
  });
}

const seedPrimaryIds = new Set(BROWSE_PRIMARY_INDUSTRIES.map((p) => p.id));
const seedSubIds = new Set(BROWSE_SUB_INDUSTRIES.map((s) => s.id));

export function isSeedPrimaryIndustry(id: string): boolean {
  return seedPrimaryIds.has(id);
}

export function isSeedSubIndustry(id: string): boolean {
  return seedSubIds.has(id);
}

export function listMergedBrowsePrimaryIndustries(): BrowsePrimaryIndustry[] {
  const o = getBrowseIndustryOverrides();
  const removed = new Set((o.removedPrimaryIds ?? []).filter((x) => typeof x === "string"));
  const patched = new Map<string, Partial<BrowsePrimaryIndustry & { id: string }>>();
  for (const row of o.patchedPrimaries ?? []) {
    if (!row || typeof (row as any).id !== "string") continue;
    patched.set((row as any).id, row);
  }
  const base = BROWSE_PRIMARY_INDUSTRIES
    .filter((p) => !removed.has(p.id))
    .map((p) => ({ ...p, ...(patched.get(p.id) ?? {}) }))
    // slug를 패치로 비우는 실수 방지
    .map((p) => ({ ...p, slug: String(p.slug ?? "").trim() || p.slug }));
  return [...base, ...(o.addedPrimaries ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function listMergedBrowseSubIndustries(primarySlug: string): BrowseSubIndustry[] {
  const slug = primarySlug.trim();
  const o = getBrowseIndustryOverrides();
  const removed = new Set((o.removedSubIds ?? []).filter((x) => typeof x === "string"));
  const patched = new Map<string, Partial<BrowseSubIndustry & { id: string }>>();
  for (const row of o.patchedSubs ?? []) {
    if (!row || typeof (row as any).id !== "string") continue;
    patched.set((row as any).id, row);
  }
  const base = BROWSE_SUB_INDUSTRIES
    .filter((s) => s.primarySlug === slug)
    .filter((s) => !removed.has(s.id))
    .map((s) => ({ ...s, ...(patched.get(s.id) ?? {}) }))
    .map((s) => ({ ...s, slug: String(s.slug ?? "").trim() || s.slug }));
  const extra = (o.addedSubs ?? []).filter((s) => s.primarySlug === slug);
  return [...base, ...extra].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getMergedBrowsePrimaryBySlug(slug: string): BrowsePrimaryIndustry | undefined {
  return listMergedBrowsePrimaryIndustries().find((p) => p.slug === slug.trim());
}

export function getMergedBrowseSubIndustry(
  primarySlug: string,
  subSlug: string
): BrowseSubIndustry | undefined {
  return listMergedBrowseSubIndustries(primarySlug).find((s) => s.slug === subSlug.trim());
}
