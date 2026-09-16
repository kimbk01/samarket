/**
 * Marketplace list ↔ detail — PRODUCT COMPOSITION presentation SSOT.
 *
 * NEW engine (not a rename of MarketCardMorphHost).
 * Unit = product composition { media?, price, title, meta? }
 * ONE coordinator · ONE progress p · 360ms · ≤1 instance per semantic field.
 * No media ⇒ media node is NOT created (not hidden/placeholder/skeleton).
 * Navigation remains `<Link>` + App Router.
 */

export type TradeMarketCompositionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TradeMarketCompositionDirection = "forward" | "back";

export type TradeMarketCompositionSlot = {
  text: string;
  source: TradeMarketCompositionRect;
  target: TradeMarketCompositionRect;
};

export type TradeMarketCompositionMedia = {
  url: string;
  source: TradeMarketCompositionRect;
  target: TradeMarketCompositionRect;
};

/** Distinguishes legitimate no-image products from media lost mid-transition. */
export type TradeMarketMediaContract = "present" | "absent_by_product";

export type TradeMarketProductCompositionSession = {
  listingId: string;
  generation: number;
  direction: TradeMarketCompositionDirection;
  /** present ⇒ media node required; absent_by_product ⇒ media node must not exist. */
  mediaContract: TradeMarketMediaContract;
  /** Absent product media ⇒ null. Never a placeholder media object. */
  media: TradeMarketCompositionMedia | null;
  price: TradeMarketCompositionSlot | null;
  title: TradeMarketCompositionSlot | null;
  meta: TradeMarketCompositionSlot | null;
  listRouteKey: string | null;
  viewport: { width: number; height: number };
  capturedAt: number;
};

export const TRADE_MARKET_COMPOSITION_DURATION_MS = 360;

const STORAGE_KEY = "samarket:trade-market-product-composition:v1";
const TTL_MS = 8_000;

let memory: TradeMarketProductCompositionSession | null = null;
let generationSeq = 0;
const listeners = new Set<() => void>();
const lastListById = new Map<
  string,
  {
    media: TradeMarketCompositionMedia | null;
    price: TradeMarketCompositionSlot | null;
    title: TradeMarketCompositionSlot | null;
    meta: TradeMarketCompositionSlot | null;
    listRouteKey: string | null;
  }
>();
let detailStanding: TradeMarketProductCompositionSession | null = null;
let scrollRestoreDeferred = false;
let deferredScrollRouteKey: string | null = null;

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeTradeMarketProductComposition(listener: () => void): () => void {
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

export function readTradeMarketCompositionRect(el: Element | null | undefined): TradeMarketCompositionRect | null {
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

function viewportSize(): { width: number; height: number } {
  const win = typeof window !== "undefined" ? window : null;
  return {
    width: Math.max(1, Math.round(win?.innerWidth || 1)),
    height: Math.max(1, Math.round(win?.innerHeight || 1)),
  };
}

function estimateDetailMedia(
  viewport: { width: number; height: number },
  source: TradeMarketCompositionRect | null
): TradeMarketCompositionRect | null {
  if (!source) return null;
  const w = Math.max(1, viewport.width);
  const aspect = source.width > 0 ? source.height / source.width : 1;
  const h = Math.max(48, Math.round(Math.min(w * aspect, viewport.height * 0.55)));
  return { x: 0, y: 0, width: w, height: h };
}

function estimateDetailTextStack(
  viewport: { width: number; height: number },
  media: TradeMarketCompositionRect | null,
  has: { price: boolean; title: boolean; meta: boolean }
): {
  price: TradeMarketCompositionRect | null;
  title: TradeMarketCompositionRect | null;
  meta: TradeMarketCompositionRect | null;
} {
  const inset = Math.min(20, Math.max(12, Math.round(viewport.width * 0.04)));
  let y = media ? media.y + media.height + 12 : 56;
  const width = Math.max(1, viewport.width - inset * 2);
  const price = has.price ? { x: inset, y, width, height: 28 } : null;
  if (price) y += 32;
  const title = has.title ? { x: inset, y, width, height: 24 } : null;
  if (title) y += 28;
  const meta = has.meta ? { x: inset, y, width, height: 18 } : null;
  return { price, title, meta };
}

/** Reject text targets that sit inside media — prevents image/text split & text-on-image. */
function belowMedia(
  field: TradeMarketCompositionRect | null,
  media: TradeMarketCompositionRect | null
): TradeMarketCompositionRect | null {
  if (!field) return null;
  if (!media) return field;
  if (field.y + 2 < media.y + media.height) return null;
  return field;
}

function isFresh(session: TradeMarketProductCompositionSession | null): session is TradeMarketProductCompositionSession {
  if (!session) return false;
  if (Date.now() - session.capturedAt > TTL_MS) return false;
  return Boolean(session.listingId && session.generation > 0);
}

/** Image product with lost media must never look like legitimate no-image. */
export function isTradeMarketCompositionMediaOwnershipValid(
  session: Pick<TradeMarketProductCompositionSession, "mediaContract" | "media">
): boolean {
  if (session.mediaContract === "present") return Boolean(session.media?.url);
  return session.media == null;
}

/**
 * Perceptual ownership may begin only when the product composition is fully paintable.
 * IMAGE present ⇒ media paint-ready required. absent_by_product ⇒ no media node; ready immediately.
 * Never allow TEXT-READY + MEDIA-NOT-PAINTED as sole owner.
 */
export function canAcquireTradeMarketCompositionPerceptualOwnership(input: {
  mediaContract: TradeMarketMediaContract;
  media: TradeMarketCompositionMedia | null;
  mediaPaintReady: boolean;
}): boolean {
  if (!isTradeMarketCompositionMediaOwnershipValid(input)) return false;
  if (input.mediaContract === "absent_by_product") return true;
  return input.mediaPaintReady;
}

const warmedMediaUrls = new Set<string>();

/** Warm browser image cache while detail/list still owns the screen (pre-handoff). */
export function warmTradeMarketCompositionMedia(url: string | null | undefined): void {
  const src = typeof url === "string" ? url.trim() : "";
  if (!src) return;
  if (typeof Image === "undefined") return;
  if (warmedMediaUrls.has(src)) return;
  warmedMediaUrls.add(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (typeof img.decode === "function") {
      img.decode().catch(() => {
        /* cache warm is best-effort */
      });
    }
  } catch {
    /* ignore */
  }
}

function normalizeSession(raw: TradeMarketProductCompositionSession): TradeMarketProductCompositionSession | null {
  const mediaContract: TradeMarketMediaContract =
    raw.mediaContract === "present" || raw.mediaContract === "absent_by_product"
      ? raw.mediaContract
      : raw.media
        ? "present"
        : "absent_by_product";
  const session: TradeMarketProductCompositionSession = { ...raw, mediaContract };
  if (!isTradeMarketCompositionMediaOwnershipValid(session)) return null;
  return session;
}

function readStorage(): TradeMarketProductCompositionSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradeMarketProductCompositionSession;
    if (!isFresh(parsed)) return null;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function writeStorage(session: TradeMarketProductCompositionSession | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!session) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

function setSession(session: TradeMarketProductCompositionSession | null): void {
  if (!session) {
    if (memory === null && !readStorage()) return;
    memory = null;
    writeStorage(null);
    queueMicrotask(notify);
    return;
  }
  memory = session;
  writeStorage(session);
  queueMicrotask(notify);
}

export function clearTradeMarketProductComposition(): void {
  setSession(null);
}

export function clearTradeMarketProductCompositionIfGeneration(listingId: string, generation: number): void {
  const session = peekTradeMarketProductComposition();
  if (!session || session.listingId !== listingId || session.generation !== generation) return;
  clearTradeMarketProductComposition();
}

export function peekTradeMarketProductComposition(): TradeMarketProductCompositionSession | null {
  if (memory && isFresh(memory)) return memory;
  if (memory && !isFresh(memory)) {
    memory = null;
    writeStorage(null);
  }
  const fromStore = readStorage();
  if (fromStore) {
    memory = fromStore;
    return fromStore;
  }
  if (!fromStore && typeof sessionStorage !== "undefined") {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isTradeMarketProductCompositionActive(): boolean {
  return Boolean(peekTradeMarketProductComposition());
}

export function isTradeMarketProductCompositionCoveringDetail(postId: string): boolean {
  const session = peekTradeMarketProductComposition();
  return Boolean(session && session.listingId === postId.trim() && session.direction === "forward");
}

export function tradePostIdFromPath(path: string | null | undefined): string | null {
  const p = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!p.startsWith("/post/")) return null;
  const id = p.slice("/post/".length).split("/")[0]?.trim() ?? "";
  return id || null;
}

export function measureListComposition(cardEl: HTMLElement | null): {
  mediaRect: TradeMarketCompositionRect | null;
  priceRect: TradeMarketCompositionRect | null;
  titleRect: TradeMarketCompositionRect | null;
  metaRect: TradeMarketCompositionRect | null;
} {
  if (!cardEl || typeof cardEl.querySelector !== "function") {
    return { mediaRect: null, priceRect: null, titleRect: null, metaRect: null };
  }
  return {
    mediaRect: readTradeMarketCompositionRect(cardEl.querySelector('[data-ui4-slot="photos"]')),
    priceRect: readTradeMarketCompositionRect(cardEl.querySelector('[data-ui4-slot="price"]')),
    titleRect: readTradeMarketCompositionRect(cardEl.querySelector('[data-ui4-slot="title"]')),
    metaRect: readTradeMarketCompositionRect(cardEl.querySelector('[data-ui4-slot="location"]')),
  };
}

/** Live list card for reverse destination docking (same listing). */
export function findTradeMarketListDestinationCard(listingId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const id = listingId.trim();
  if (!id) return null;
  const href = `/post/${id}`;
  const exact = document.querySelectorAll(`a[href="${href}"]`);
  const loose =
    exact.length > 0 ? exact : document.querySelectorAll(`a[href^="${href}"]`);
  for (const a of loose) {
    const card =
      (a.closest("[data-market-listing-card='1']") as HTMLElement | null) || null;
    if (card) return card;
  }
  return null;
}

/**
 * Reverse destination is docked when composition rect ≈ live list media/text geometry.
 * Used to gate cover release + sole-owner handoff (D4).
 */
export function isTradeMarketReverseDestinationDocked(input: {
  compositionMedia: TradeMarketCompositionRect | null;
  compositionPrice: TradeMarketCompositionRect | null;
  compositionTitle: TradeMarketCompositionRect | null;
  liveMedia: TradeMarketCompositionRect | null;
  livePrice: TradeMarketCompositionRect | null;
  liveTitle: TradeMarketCompositionRect | null;
}): boolean {
  const near = (a: TradeMarketCompositionRect | null, b: TradeMarketCompositionRect | null) => {
    if (!a || !b) return !a && !b;
    return (
      Math.abs(a.x - b.x) <= 3 &&
      Math.abs(a.y - b.y) <= 3 &&
      Math.abs(a.width - b.width) <= 4 &&
      Math.abs(a.height - b.height) <= 4
    );
  };
  // Prefer media when present; otherwise text slots.
  if (input.liveMedia || input.compositionMedia) {
    return near(input.compositionMedia, input.liveMedia);
  }
  return (
    near(input.compositionPrice, input.livePrice) && near(input.compositionTitle, input.liveTitle)
  );
}

export function measureDetailComposition(root: HTMLElement | null): {
  mediaRect: TradeMarketCompositionRect | null;
  priceRect: TradeMarketCompositionRect | null;
  titleRect: TradeMarketCompositionRect | null;
  metaRect: TradeMarketCompositionRect | null;
} {
  if (!root) {
    return { mediaRect: null, priceRect: null, titleRect: null, metaRect: null };
  }
  return {
    mediaRect: readTradeMarketCompositionRect(root.querySelector('[data-ui5-slot="photos"]')),
    priceRect: readTradeMarketCompositionRect(root.querySelector('[data-ui5-slot="price"]')),
    titleRect: readTradeMarketCompositionRect(root.querySelector('[data-ui5-slot="title"]')),
    metaRect: readTradeMarketCompositionRect(root.querySelector('[data-ui5-slot="location"]')),
  };
}

/**
 * Live target patch while covered. Silent (no notify) — clock must not restart.
 * Rejects text targets inside media. Never invents media when session.media is null.
 */
/**
 * Reverse-only: refresh destination targets from the actual mounted list card.
 * Does not restart the clock, change generation, or notify remount — paint() peeks each frame.
 */
export function bindTradeMarketReverseLiveDestinationTargets(input: {
  listingId: string;
  mediaRect: TradeMarketCompositionRect | null;
  priceRect: TradeMarketCompositionRect | null;
  titleRect: TradeMarketCompositionRect | null;
  metaRect: TradeMarketCompositionRect | null;
}): void {
  const session = peekTradeMarketProductComposition();
  if (!session || session.listingId !== input.listingId.trim()) return;
  if (session.direction !== "back") return;

  memory = {
    ...session,
    media:
      session.media && input.mediaRect
        ? { ...session.media, target: input.mediaRect }
        : session.media,
    price:
      session.price && input.priceRect
        ? { ...session.price, target: input.priceRect }
        : session.price,
    title:
      session.title && input.titleRect
        ? { ...session.title, target: input.titleRect }
        : session.title,
    meta:
      session.meta && input.metaRect
        ? { ...session.meta, target: input.metaRect }
        : session.meta,
  };
}

export function publishTradeMarketProductCompositionTargets(input: {
  listingId: string;
  mediaRect: TradeMarketCompositionRect | null;
  priceRect: TradeMarketCompositionRect | null;
  titleRect: TradeMarketCompositionRect | null;
  metaRect: TradeMarketCompositionRect | null;
}): void {
  const session = peekTradeMarketProductComposition();
  if (!session || session.listingId !== input.listingId.trim()) return;
  if (session.direction !== "forward") return;

  let mediaTarget = session.media ? input.mediaRect ?? session.media.target : null;
  if (session.media && mediaTarget && mediaTarget.height < session.media.target.height * 0.55) {
    mediaTarget = session.media.target;
  }
  const mediaForText = session.media ? mediaTarget ?? session.media.target : null;
  const fallback = estimateDetailTextStack(session.viewport, mediaForText, {
    price: Boolean(session.price),
    title: Boolean(session.title),
    meta: Boolean(session.meta),
  });

  memory = {
    ...session,
    media: session.media
      ? { ...session.media, target: mediaTarget ?? session.media.target }
      : null,
    price: session.price
      ? {
          ...session.price,
          target:
            belowMedia(input.priceRect, mediaForText) ??
            belowMedia(fallback.price, mediaForText) ??
            session.price.target,
        }
      : null,
    title: session.title
      ? {
          ...session.title,
          target:
            belowMedia(input.titleRect, mediaForText) ??
            belowMedia(fallback.title, mediaForText) ??
            session.title.target,
        }
      : null,
    meta: session.meta
      ? {
          ...session.meta,
          target:
            belowMedia(input.metaRect, mediaForText) ??
            belowMedia(fallback.meta, mediaForText) ??
            session.meta.target,
        }
      : null,
  };
  writeStorage(memory);
}

export function publishTradeMarketProductCompositionStanding(input: {
  listingId: string;
  rootEl: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
}): void {
  if (prefersReducedMotion()) {
    detailStanding = null;
    return;
  }
  const root = input.rootEl;
  if (!root) return;
  const measured = measureDetailComposition(root);
  const imageUrl = typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  // No imageUrl ⇒ no media node — empty photos footprint is NOT product media.
  const media =
    imageUrl && measured.mediaRect
      ? { url: imageUrl, source: measured.mediaRect, target: measured.mediaRect }
      : null;
  const priceText = (input.priceText ?? "").trim();
  const titleText = (input.titleText ?? "").trim();
  const metaText = (input.locationText ?? "").trim();
  const mediaContract: TradeMarketMediaContract = media ? "present" : "absent_by_product";
  // Image URL without measurable media ⇒ LOST, not absent-by-product — do not stand partial.
  if (imageUrl && !media) {
    detailStanding = null;
    return;
  }
  if (media?.url) warmTradeMarketCompositionMedia(media.url);

  detailStanding = {
    listingId: input.listingId.trim(),
    generation: 0,
    direction: "back",
    mediaContract,
    media,
    price:
      priceText && measured.priceRect
        ? { text: priceText, source: measured.priceRect, target: measured.priceRect }
        : null,
    title:
      titleText && measured.titleRect
        ? { text: titleText, source: measured.titleRect, target: measured.titleRect }
        : null,
    meta:
      metaText && measured.metaRect
        ? { text: metaText, source: measured.metaRect, target: measured.metaRect }
        : null,
    listRouteKey: input.listRouteKey?.trim() || null,
    viewport: viewportSize(),
    capturedAt: Date.now(),
  };
}

export function clearTradeMarketProductCompositionStanding(): void {
  detailStanding = null;
}

export function peekTradeMarketProductCompositionStanding(): TradeMarketProductCompositionSession | null {
  return detailStanding && Date.now() - detailStanding.capturedAt < TTL_MS ? detailStanding : null;
}

export function armTradeMarketProductCompositionForward(input: {
  listingId: string;
  cardEl: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
}): TradeMarketProductCompositionSession | null {
  if (prefersReducedMotion()) {
    clearTradeMarketProductComposition();
    return null;
  }
  const listingId = input.listingId.trim();
  const el = input.cardEl;
  if (!listingId || !el) {
    clearTradeMarketProductComposition();
    return null;
  }
  const existing = peekTradeMarketProductComposition();
  if (
    existing &&
    existing.direction === "forward" &&
    existing.listingId === listingId &&
    Date.now() - existing.capturedAt < 500
  ) {
    return existing;
  }

  const measured = measureListComposition(el);
  const imageUrl = typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  // CRITICAL: empty list thumbnail footprint ≠ product media.
  const hasMedia = Boolean(imageUrl && measured.mediaRect);
  // Image product missing media geometry ⇒ fail closed (not content-only / LOST).
  if (imageUrl && !hasMedia) {
    clearTradeMarketProductComposition();
    return null;
  }
  const mediaContract: TradeMarketMediaContract = hasMedia ? "present" : "absent_by_product";
  const vp = viewportSize();
  const mediaTarget = hasMedia ? estimateDetailMedia(vp, measured.mediaRect) : null;
  const textTargets = estimateDetailTextStack(vp, mediaTarget, {
    price: Boolean((input.priceText ?? "").trim()),
    title: Boolean((input.titleText ?? "").trim()),
    meta: Boolean((input.locationText ?? "").trim()),
  });

  const priceText = (input.priceText ?? "").trim();
  const titleText = (input.titleText ?? "").trim();
  const metaText = (input.locationText ?? "").trim();

  const priceSrc =
    measured.priceRect ??
    (measured.mediaRect
      ? {
          x: measured.mediaRect.x,
          y: measured.mediaRect.y + measured.mediaRect.height + 8,
          width: measured.mediaRect.width,
          height: 20,
        }
      : null);
  const titleSrc =
    measured.titleRect ??
    (priceSrc ? { ...priceSrc, y: priceSrc.y + 22, height: 18 } : null);
  const metaSrc =
    measured.metaRect ??
    (titleSrc ? { ...titleSrc, y: titleSrc.y + 20, height: 16 } : null);

  generationSeq += 1;
  const session: TradeMarketProductCompositionSession = {
    listingId,
    generation: generationSeq,
    direction: "forward",
    mediaContract,
    media:
      hasMedia && measured.mediaRect && mediaTarget
        ? { url: imageUrl!, source: measured.mediaRect, target: mediaTarget }
        : null,
    price:
      priceText && priceSrc && textTargets.price
        ? { text: priceText, source: priceSrc, target: textTargets.price }
        : null,
    title:
      titleText && titleSrc && textTargets.title
        ? { text: titleText, source: titleSrc, target: textTargets.title }
        : null,
    meta:
      metaText && metaSrc && textTargets.meta
        ? { text: metaText, source: metaSrc, target: textTargets.meta }
        : null,
    listRouteKey: input.listRouteKey?.trim() || null,
    viewport: vp,
    capturedAt: Date.now(),
  };

  if (session.media?.url) warmTradeMarketCompositionMedia(session.media.url);

  lastListById.set(listingId, {
    media: session.media,
    price: session.price,
    title: session.title,
    meta: session.meta,
    listRouteKey: session.listRouteKey,
  });
  scrollRestoreDeferred = false;
  deferredScrollRouteKey = null;
  setSession(session);
  return session;
}

export function armTradeMarketProductCompositionBack(input: {
  listingId: string;
  rootEl: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
}): TradeMarketProductCompositionSession | null {
  if (prefersReducedMotion()) {
    clearTradeMarketProductComposition();
    return null;
  }
  const listingId = input.listingId.trim();
  if (!listingId || !input.rootEl) {
    clearTradeMarketProductComposition();
    return null;
  }
  const measured = measureDetailComposition(input.rootEl);
  const remembered = lastListById.get(listingId);
  const imageUrl = typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  const hasMedia = Boolean(imageUrl && measured.mediaRect);
  // Image product missing reverse media capture ⇒ fail closed (forbidden LOST_DURING_TRANSITION).
  if (imageUrl && !hasMedia) {
    clearTradeMarketProductComposition();
    return null;
  }
  const mediaContract: TradeMarketMediaContract = hasMedia ? "present" : "absent_by_product";
  const vp = viewportSize();

  const listMedia = remembered?.media?.source ?? null;
  const listPrice = remembered?.price?.source ?? null;
  const listTitle = remembered?.title?.source ?? null;
  const listMeta = remembered?.meta?.source ?? null;

  const priceText = (input.priceText ?? "").trim();
  const titleText = (input.titleText ?? "").trim();
  const metaText = (input.locationText ?? "").trim();

  generationSeq += 1;
  const session: TradeMarketProductCompositionSession = {
    listingId,
    generation: generationSeq,
    direction: "back",
    mediaContract,
    media:
      hasMedia && measured.mediaRect
        ? {
            url: imageUrl!,
            source: measured.mediaRect,
            target: listMedia ?? measured.mediaRect,
          }
        : null,
    price:
      priceText && measured.priceRect
        ? {
            text: priceText,
            source: measured.priceRect,
            target: listPrice ?? measured.priceRect,
          }
        : null,
    title:
      titleText && measured.titleRect
        ? {
            text: titleText,
            source: measured.titleRect,
            target: listTitle ?? measured.titleRect,
          }
        : null,
    meta:
      metaText && measured.metaRect
        ? {
            text: metaText,
            source: measured.metaRect,
            target: listMeta ?? measured.metaRect,
          }
        : null,
    listRouteKey: input.listRouteKey?.trim() || remembered?.listRouteKey || null,
    viewport: vp,
    capturedAt: Date.now(),
  };

  if (session.media?.url) warmTradeMarketCompositionMedia(session.media.url);

  scrollRestoreDeferred = true;
  deferredScrollRouteKey = session.listRouteKey;
  setSession(session);
  return session;
}

export function armTradeMarketProductCompositionBackFromStandingIfNeeded(input: {
  fromPostId: string;
  listRouteKey: string;
}): TradeMarketProductCompositionSession | null {
  if (peekTradeMarketProductComposition()?.direction === "back") return peekTradeMarketProductComposition();
  return armTradeMarketProductCompositionBackFromStanding(input);
}

/** Standing-backed back when rootEl unavailable: rebuild from standing snapshot geometry. */
export function armTradeMarketProductCompositionBackFromStanding(input: {
  fromPostId: string;
  listRouteKey: string;
}): TradeMarketProductCompositionSession | null {
  const standing = peekTradeMarketProductCompositionStanding();
  if (!standing || standing.listingId !== input.fromPostId.trim()) return null;
  if (peekTradeMarketProductComposition()?.direction === "back") return peekTradeMarketProductComposition();
  const remembered = lastListById.get(standing.listingId);
  if (!isTradeMarketCompositionMediaOwnershipValid(standing)) {
    clearTradeMarketProductComposition();
    return null;
  }
  generationSeq += 1;
  const session: TradeMarketProductCompositionSession = {
    ...standing,
    generation: generationSeq,
    direction: "back",
    mediaContract: standing.mediaContract,
    media: standing.media
      ? {
          ...standing.media,
          source: standing.media.source,
          target: remembered?.media?.source ?? standing.media.source,
        }
      : null,
    price: standing.price
      ? {
          ...standing.price,
          source: standing.price.source,
          target: remembered?.price?.source ?? standing.price.source,
        }
      : null,
    title: standing.title
      ? {
          ...standing.title,
          source: standing.title.source,
          target: remembered?.title?.source ?? standing.title.source,
        }
      : null,
    meta: standing.meta
      ? {
          ...standing.meta,
          source: standing.meta.source,
          target: remembered?.meta?.source ?? standing.meta.source,
        }
      : null,
    listRouteKey: input.listRouteKey || standing.listRouteKey,
    capturedAt: Date.now(),
  };
  if (session.media?.url) warmTradeMarketCompositionMedia(session.media.url);

  scrollRestoreDeferred = true;
  deferredScrollRouteKey = session.listRouteKey;
  setSession(session);
  return session;
}

export function shouldDeferTradeMarketListScrollRestore(_routeKey: string): boolean {
  if (!scrollRestoreDeferred) return false;
  return isTradeMarketProductCompositionActive();
}

export function takeDeferredTradeMarketListScrollRouteKey(): string | null {
  if (!scrollRestoreDeferred) return null;
  const key = deferredScrollRouteKey;
  scrollRestoreDeferred = false;
  deferredScrollRouteKey = null;
  return key;
}
