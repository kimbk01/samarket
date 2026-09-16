/**
 * Marketplace list-card → detail — visual origin SSOT (geometry only).
 *
 * HARD LOCK: does not own navigation. Capture runs on intentional Link click;
 * `<Link>` + App Router remain the sole navigation owner.
 *
 * Visual owner: MarketCardOriginExpandOverlayHost (ONE). Never depend on
 * `loading.tsx` mounting for animation correctness.
 *
 * Architecture (post V2 snapshot-scale DELETE):
 * - NEVER clone+scale whole card HTML (that stretches typography).
 * - WITH image: FLIP only the thumbnail image layer → detail hero rect.
 * - WITHOUT image: card-surface veil expands (no text inside); empty list
 *   thumbnail slot is NOT animated into a fake detail media region.
 * - Real detail owns the screen after a single 360ms handoff.
 */
export type TradeMarketCardOriginRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TradeMarketCardOriginExpand = {
  listingId: string;
  /** Monotonic generation so each tap remounts a fresh visual session. */
  generation: number;
  /** Full card geometry (veil / no-image expand source). */
  rect: TradeMarketCardOriginRect;
  /** LIST thumbnail slot geometry (always present on Marketplace cards). */
  thumbRect: TradeMarketCardOriginRect | null;
  /** Meta/content column geometry (price/title/location). */
  contentRect: TradeMarketCardOriginRect | null;
  viewport: { width: number; height: number };
  imageUrl: string | null;
  capturedAt: number;
};

/** Canonical expand duration — CSS + lifecycle cleanup must derive from this. */
export const CARD_ORIGIN_EXPAND_DURATION_MS = 360;

const STORAGE_KEY = "samarket:trade-market-card-origin-expand:v1";
const TTL_MS = 8_000;

let memory: TradeMarketCardOriginExpand | null = null;
let generationSeq = 0;
const listeners = new Set<() => void>();

function notifyOriginListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeTradeMarketCardOriginExpand(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function prefersReducedMotion(): boolean {
  if (typeof globalThis === "undefined") return true;
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (typeof mm !== "function") return false;
  try {
    return mm.call(globalThis, "(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readRect(el: Element | null | undefined): TradeMarketCardOriginRect | null {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== "function") return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (!(r.width > 4 && r.height > 4)) return null;
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function isFresh(origin: TradeMarketCardOriginExpand | null): origin is TradeMarketCardOriginExpand {
  if (!origin) return false;
  if (!origin.listingId.trim()) return false;
  if (!(origin.rect.width > 8 && origin.rect.height > 8)) return false;
  if (origin.capturedAt + TTL_MS < Date.now()) return false;
  return true;
}

function readStorage(): TradeMarketCardOriginExpand | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradeMarketCardOriginExpand;
    return isFresh(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(origin: TradeMarketCardOriginExpand | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!origin) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(origin));
  } catch {
    /* quota */
  }
}

export function clearTradeMarketCardOriginExpand(): void {
  memory = null;
  writeStorage(null);
  notifyOriginListeners();
}

export function peekTradeMarketCardOriginExpand(): TradeMarketCardOriginExpand | null {
  if (isFresh(memory)) return memory;
  const stored = readStorage();
  memory = stored;
  if (!stored) clearTradeMarketCardOriginExpand();
  return stored;
}

export function hasActiveTradeMarketCardOriginForPostId(postId: string): boolean {
  const id = postId.trim();
  if (!id) return false;
  const origin = peekTradeMarketCardOriginExpand();
  return Boolean(origin && origin.listingId === id);
}

/**
 * Clear only when the active session matches listing + generation.
 * Prevents a late timeout from wiping a newer tap's snapshot.
 */
export function clearTradeMarketCardOriginExpandIfGeneration(
  listingId: string,
  generation: number
): void {
  const origin = peekTradeMarketCardOriginExpand();
  if (!origin) return;
  if (origin.listingId !== listingId.trim() || origin.generation !== generation) return;
  clearTradeMarketCardOriginExpand();
}

/**
 * @deprecated Prefer overlay-owned clear after CARD_ORIGIN_EXPAND_DURATION_MS.
 * Kept for tests / emergency cleanup — does not own animation timing.
 */
export function consumeTradeMarketCardOriginExpandForPostId(
  postId: string
): TradeMarketCardOriginExpand | null {
  const origin = peekTradeMarketCardOriginExpand();
  if (!origin || origin.listingId !== postId.trim()) return null;
  clearTradeMarketCardOriginExpand();
  return origin;
}

/** Extract `/post/{id}` from a path for origin matching. */
export function tradePostIdFromPath(path: string | null | undefined): string | null {
  const p = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!p.startsWith("/post/")) return null;
  const id = p.slice("/post/".length).split("/")[0]?.trim() ?? "";
  return id || null;
}

/**
 * Capture selected card geometry. Safe no-op when reduced-motion or invalid rect.
 * Never calls preventDefault / router.push.
 * Does NOT clone card HTML (no stretched-text snapshot).
 */
export function captureTradeMarketCardOriginExpand(input: {
  listingId: string;
  cardEl: HTMLElement | null;
  imageUrl?: string | null;
}): TradeMarketCardOriginExpand | null {
  const win =
    typeof globalThis !== "undefined" && typeof (globalThis as { innerWidth?: number }).innerWidth === "number"
      ? (globalThis as Window & typeof globalThis)
      : typeof window !== "undefined"
        ? window
        : null;
  if (!win) return null;
  if (prefersReducedMotion()) {
    clearTradeMarketCardOriginExpand();
    return null;
  }
  const listingId = input.listingId.trim();
  const el = input.cardEl;
  if (!listingId || !el) {
    clearTradeMarketCardOriginExpand();
    return null;
  }
  const rect = readRect(el);
  if (!rect) {
    clearTradeMarketCardOriginExpand();
    return null;
  }
  const thumbEl =
    typeof el.querySelector === "function"
      ? el.querySelector<HTMLElement>('[data-ui4-slot="photos"]')
      : null;
  const metaEl =
    typeof el.querySelector === "function"
      ? el.querySelector<HTMLElement>("[data-market-card-meta='1']")
      : null;
  generationSeq += 1;
  const imageUrl =
    typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  const origin: TradeMarketCardOriginExpand = {
    listingId,
    generation: generationSeq,
    rect,
    thumbRect: readRect(thumbEl),
    contentRect: readRect(metaEl),
    viewport: {
      width: Math.max(1, Math.round(win.innerWidth || 1)),
      height: Math.max(1, Math.round(win.innerHeight || 1)),
    },
    imageUrl,
    capturedAt: Date.now(),
  };
  memory = origin;
  writeStorage(origin);
  notifyOriginListeners();
  return origin;
}

/**
 * Detail hero target for image FLIP — full-bleed top square matching list aspect.
 * Not used for no-image (empty list slot must not become a fake detail media region).
 */
export function tradeMarketCardOriginHeroTarget(origin: TradeMarketCardOriginExpand): TradeMarketCardOriginRect {
  const w = Math.max(1, origin.viewport.width);
  return { x: 0, y: 0, width: w, height: w };
}
