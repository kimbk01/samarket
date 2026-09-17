/**
 * Trade list presentation session — retained across list↔detail soft navigation.
 *
 * Authority: list presentation continuity (load-more, scroll, selected product, geometry).
 * NOT a second database. NOT reverse destination reconstruction.
 *
 * Soft App Router nav keeps the JS module alive while the market leaf remounts;
 * this session is the return surface for expanded lists.
 *
 * Identity isolation: HOME / CATEGORY A / CATEGORY B use distinct canonical identities
 * (marketplaceBrowseStateIdentityKey). Sessions are keyed by identity — no cross-hydrate.
 */

import type { PostWithMeta } from "@/lib/posts/schema";

/** Presentation geometry snapshot — shared shape with composition rects, no import cycle. */
export type TradeListPresentationRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TradeListPresentationSelectedGeometry = {
  mediaRect: TradeListPresentationRect | null;
  priceRect: TradeListPresentationRect | null;
  titleRect: TradeListPresentationRect | null;
  metaRect: TradeListPresentationRect | null;
  imageUrl: string | null;
  priceText: string | null;
  titleText: string | null;
  locationText: string | null;
};

export type TradeListPresentationSession = {
  /** Canonical list identity (marketplaceBrowseStateIdentityKey). */
  identity: string;
  productIds: string[];
  posts: PostWithMeta[];
  favoriteMap: Record<string, boolean>;
  visibleCount: number;
  serverPage: number;
  serverHasMore: boolean;
  scrollY: number;
  selectedProductId: string | null;
  selectedGeometry: TradeListPresentationSelectedGeometry | null;
  updatedAt: number;
};

const TTL_MS = 10 * 60_000;
const MAX_SESSIONS = 8;

const sessions = new Map<string, TradeListPresentationSession>();

function alive(s: TradeListPresentationSession | null | undefined): s is TradeListPresentationSession {
  return Boolean(s && Date.now() - s.updatedAt <= TTL_MS);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.updatedAt > TTL_MS) sessions.delete(k);
  }
  while (sessions.size > MAX_SESSIONS) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, s] of sessions) {
      if (s.updatedAt < oldestAt) {
        oldestAt = s.updatedAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    sessions.delete(oldestKey);
  }
}

export function clearTradeListPresentationSession(identity?: string): void {
  if (identity) {
    sessions.delete(identity.trim());
    return;
  }
  sessions.clear();
}

export function peekTradeListPresentationSession(): TradeListPresentationSession | null {
  pruneExpired();
  let latest: TradeListPresentationSession | null = null;
  for (const s of sessions.values()) {
    if (!alive(s)) continue;
    if (!latest || s.updatedAt > latest.updatedAt) latest = s;
  }
  return latest;
}

export function peekTradeListPresentationSessionForIdentity(
  identity: string
): TradeListPresentationSession | null {
  pruneExpired();
  const s = sessions.get(identity.trim());
  if (!alive(s)) {
    if (s) sessions.delete(identity.trim());
    return null;
  }
  return s;
}

/** Persist / replace the presentation snapshot for this list identity. */
export function commitTradeListPresentationSession(input: {
  identity: string;
  posts: PostWithMeta[];
  favoriteMap?: Record<string, boolean>;
  visibleCount: number;
  serverPage: number;
  serverHasMore: boolean;
  scrollY?: number;
}): TradeListPresentationSession {
  const identity = input.identity.trim();
  const prev = peekTradeListPresentationSessionForIdentity(identity);
  const next: TradeListPresentationSession = {
    identity,
    productIds: input.posts.map((p) => p.id),
    posts: input.posts.slice(),
    favoriteMap: { ...(input.favoriteMap ?? prev?.favoriteMap ?? {}) },
    visibleCount: Math.max(0, Math.floor(input.visibleCount)),
    serverPage: Math.max(1, Math.floor(input.serverPage)),
    serverHasMore: Boolean(input.serverHasMore),
    scrollY:
      typeof input.scrollY === "number" && Number.isFinite(input.scrollY)
        ? Math.max(0, input.scrollY)
        : (prev?.scrollY ?? 0),
    selectedProductId: prev?.selectedProductId ?? null,
    selectedGeometry: prev?.selectedGeometry ?? null,
    updatedAt: Date.now(),
  };
  sessions.set(identity, next);
  pruneExpired();
  return next;
}

export function rememberTradeListPresentationScroll(identity: string, scrollY: number): void {
  const s = peekTradeListPresentationSessionForIdentity(identity);
  if (!s) return;
  sessions.set(identity, {
    ...s,
    scrollY: Math.max(0, scrollY),
    updatedAt: Date.now(),
  });
}

export function rememberTradeListPresentationSelection(input: {
  identity: string;
  productId: string;
  geometry: TradeListPresentationSelectedGeometry | null;
  scrollY?: number;
}): void {
  const identity = input.identity.trim();
  const productId = input.productId.trim();
  if (!identity || !productId) return;
  const s = peekTradeListPresentationSessionForIdentity(identity);
  if (!s) return;
  sessions.set(identity, {
    ...s,
    selectedProductId: productId,
    selectedGeometry: input.geometry,
    scrollY:
      typeof input.scrollY === "number" && Number.isFinite(input.scrollY)
        ? Math.max(0, input.scrollY)
        : s.scrollY,
    updatedAt: Date.now(),
  });
}

export function tradeListPresentationHasProduct(identity: string, productId: string): boolean {
  const s = peekTradeListPresentationSessionForIdentity(identity);
  if (!s) return false;
  const id = productId.trim();
  return s.productIds.includes(id);
}

export function takeTradeListPresentationSessionForRestore(
  identity: string
): TradeListPresentationSession | null {
  return peekTradeListPresentationSessionForIdentity(identity);
}

export function clearTradeListPresentationSelection(identity?: string): void {
  if (identity) {
    const s = peekTradeListPresentationSessionForIdentity(identity);
    if (!s) return;
    sessions.set(identity.trim(), {
      ...s,
      selectedProductId: null,
      selectedGeometry: null,
      updatedAt: Date.now(),
    });
    return;
  }
  for (const [k, s] of sessions) {
    sessions.set(k, {
      ...s,
      selectedProductId: null,
      selectedGeometry: null,
      updatedAt: Date.now(),
    });
  }
}

/** Test/diagnostics: active identity keys. */
export function peekTradeListPresentationSessionIdentities(): string[] {
  pruneExpired();
  return [...sessions.keys()];
}

/** Runtime probe surface for retain proofs (browser only). */
declare global {
  interface Window {
    __DIBAY_TRADE_LIST_PRESENTATION__?: {
      identities: () => string[];
      peek: (identity: string) => TradeListPresentationSession | null;
      peekLatest: () => TradeListPresentationSession | null;
    };
  }
}

if (typeof window !== "undefined") {
  window.__DIBAY_TRADE_LIST_PRESENTATION__ = {
    identities: peekTradeListPresentationSessionIdentities,
    peek: peekTradeListPresentationSessionForIdentity,
    peekLatest: peekTradeListPresentationSession,
  };
}
