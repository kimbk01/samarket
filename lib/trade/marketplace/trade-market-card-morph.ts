/**
 * Marketplace list ↔ detail — SINGLE presentation coordinator (geometry + cover).
 *
 * HARD LOCK:
 * - Does NOT own navigation. `<Link>` + App Router remain sole nav owner.
 * - ONE 360ms timeline for forward and back.
 * - Image + information are coordinated children (text never non-uniform scaled).
 * - Real detail stays covered until morph releases — no second visible presentation.
 */

export type TradeMarketMorphRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TradeMarketMorphDirection = "forward" | "back";

export type TradeMarketMorphFieldRects = {
  priceRect: TradeMarketMorphRect | null;
  titleRect: TradeMarketMorphRect | null;
  locationRect: TradeMarketMorphRect | null;
};

export type TradeMarketCardMorphSession = {
  listingId: string;
  generation: number;
  direction: TradeMarketMorphDirection;
  /** Full card / detail chrome source rect. */
  cardRect: TradeMarketMorphRect;
  /** LIST thumb slot or DETAIL photos section (null when no media). */
  thumbRect: TradeMarketMorphRect | null;
  /** Price/title/location block (union — legacy + layout fallback). */
  contentRect: TradeMarketMorphRect | null;
  /** Per-field source geometry — ONE transitional instance each. */
  priceRect: TradeMarketMorphRect | null;
  titleRect: TradeMarketMorphRect | null;
  locationRect: TradeMarketMorphRect | null;
  /** Measured or estimated destination hero (null = no media at target). */
  targetHeroRect: TradeMarketMorphRect | null;
  /** Measured or estimated destination content block (union). */
  targetContentRect: TradeMarketMorphRect | null;
  targetPriceRect: TradeMarketMorphRect | null;
  targetTitleRect: TradeMarketMorphRect | null;
  targetLocationRect: TradeMarketMorphRect | null;
  viewport: { width: number; height: number };
  imageUrl: string | null;
  priceText: string;
  titleText: string;
  locationText: string;
  /** List browse key — scroll DATA restore after back morph completes. */
  listRouteKey: string | null;
  capturedAt: number;
};

/** Canonical morph duration — CSS + lifecycle must derive from this. */
export const MARKET_CARD_MORPH_DURATION_MS = 360;

const STORAGE_KEY = "samarket:trade-market-card-morph:v2";
/** MORPH_MODULE_REV=2 */
const TTL_MS = 8_000;

let memory: TradeMarketCardMorphSession | null = null;
let generationSeq = 0;
const listeners = new Set<() => void>();

/** Standing detail snapshot for system/gesture back (popstate). */
let detailStandingSnapshot: TradeMarketCardMorphSession | null = null;

/** Last list card geometry by listing id — used for reverse target. */
const lastListGeometryById = new Map<
  string,
  {
    cardRect: TradeMarketMorphRect;
    thumbRect: TradeMarketMorphRect | null;
    contentRect: TradeMarketMorphRect | null;
    priceRect: TradeMarketMorphRect | null;
    titleRect: TradeMarketMorphRect | null;
    locationRect: TradeMarketMorphRect | null;
    listRouteKey: string | null;
  }
>();

/** When true, list scroll restore must wait for morph host completion. */
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

export function subscribeTradeMarketCardMorph(listener: () => void): () => void {
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

export function readTradeMarketMorphRect(el: Element | null | undefined): TradeMarketMorphRect | null {
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

function unionRects(a: TradeMarketMorphRect | null, b: TradeMarketMorphRect | null): TradeMarketMorphRect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function isFresh(session: TradeMarketCardMorphSession | null): session is TradeMarketCardMorphSession {
  if (!session) return false;
  if (!session.listingId.trim()) return false;
  if (!(session.cardRect.width > 8 && session.cardRect.height > 8)) return false;
  if (session.capturedAt + TTL_MS < Date.now()) return false;
  return true;
}

function readStorage(): TradeMarketCardMorphSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradeMarketCardMorphSession;
    return isFresh(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(session: TradeMarketCardMorphSession | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!session) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* quota */
  }
}

/** Drop stale/empty storage key without publishing a morph-state transition. */
function sanitizeStorageSilent(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (sessionStorage.getItem(STORAGE_KEY) != null) sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* quota / private mode */
  }
}

/** Defer host paint so <Link> can commit App Router navigation in the same click turn. */
function notifyDeferred(): void {
  if (typeof queueMicrotask === "function") queueMicrotask(() => notify());
  else setTimeout(() => notify(), 0);
}

/**
 * Canonical mutation: notify only when observable morph state actually changes.
 * set(null) delegates to clear (absent clear = no-op, no notify).
 */
function setSession(session: TradeMarketCardMorphSession | null): void {
  if (session === null) {
    clearTradeMarketCardMorph();
    return;
  }
  memory = session;
  writeStorage(session);
  notifyDeferred();
}

/**
 * Clear is idempotent: ABSENT → ABSENT does not notify.
 * PRESENT → ABSENT notifies once.
 */
export function clearTradeMarketCardMorph(): void {
  const wasPresent = isFresh(memory) || Boolean(readStorage());
  memory = null;
  writeStorage(null);
  if (wasPresent) notifyDeferred();
}

export function clearTradeMarketCardMorphIfGeneration(listingId: string, generation: number): void {
  const session = peekTradeMarketCardMorph();
  if (!session) return;
  if (session.listingId !== listingId.trim() || session.generation !== generation) return;
  clearTradeMarketCardMorph();
}

/**
 * Observational read. ABSENT peek must not publish a state-change event.
 * Stale/invalid storage is sanitized silently (not a morph mutation notification).
 */
export function peekTradeMarketCardMorph(): TradeMarketCardMorphSession | null {
  if (isFresh(memory)) return memory;
  const stored = readStorage();
  if (stored) {
    memory = stored;
    return stored;
  }
  memory = null;
  sanitizeStorageSilent();
  return null;
}

export function isTradeMarketCardMorphActive(): boolean {
  return Boolean(peekTradeMarketCardMorph());
}

export function isTradeMarketCardMorphActiveForPostId(postId: string): boolean {
  const id = postId.trim();
  if (!id) return false;
  const session = peekTradeMarketCardMorph();
  return Boolean(session && session.listingId === id);
}

/** Detail must stay invisible while this forward/back morph covers perception. */
export function isTradeMarketCardMorphCoveringDetail(postId: string): boolean {
  const session = peekTradeMarketCardMorph();
  if (!session || session.listingId !== postId.trim()) return false;
  return session.direction === "forward";
}

/** Suppress AppRouteTransition rtl/ltr for Marketplace card↔detail while morph owns visuals. */
export function isTradeMarketCardMorphSuppressingRouteEnter(): boolean {
  return isTradeMarketCardMorphActive();
}

export function tradePostIdFromPath(path: string | null | undefined): string | null {
  const p = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!p.startsWith("/post/")) return null;
  const id = p.slice("/post/".length).split("/")[0]?.trim() ?? "";
  return id || null;
}

function viewportSize(): { width: number; height: number } {
  const win =
    typeof globalThis !== "undefined" && typeof (globalThis as { innerWidth?: number }).innerWidth === "number"
      ? (globalThis as Window & typeof globalThis)
      : typeof window !== "undefined"
        ? window
        : null;
  return {
    width: Math.max(1, Math.round(win?.innerWidth || 1)),
    height: Math.max(1, Math.round(win?.innerHeight || 1)),
  };
}

/**
 * Estimate detail hero from viewport + source thumb aspect.
 * Prefer live measure via publishTradeMarketMorphTargetGeometry when available.
 * Never hard-locks to viewport.width² only — uses source aspect when present.
 */
export function estimateTradeMarketDetailHeroRect(
  viewport: { width: number; height: number },
  thumbRect: TradeMarketMorphRect | null,
  hasImage: boolean
): TradeMarketMorphRect | null {
  if (!hasImage) return null;
  const w = Math.max(1, viewport.width);
  const aspect =
    thumbRect && thumbRect.width > 0 ? thumbRect.height / Math.max(1, thumbRect.width) : 1;
  const h = Math.max(48, Math.round(Math.min(w * aspect, viewport.height * 0.55)));
  return { x: 0, y: 0, width: w, height: h };
}

export function estimateTradeMarketDetailContentRect(
  viewport: { width: number; height: number },
  heroRect: TradeMarketMorphRect | null
): TradeMarketMorphRect {
  const inset = Math.min(20, Math.max(12, Math.round(viewport.width * 0.04)));
  const y = heroRect ? heroRect.y + heroRect.height + 12 : 56;
  return {
    x: inset,
    y,
    width: Math.max(1, viewport.width - inset * 2),
    height: 96,
  };
}

/** Stack estimated detail field rects under hero — used until live measure publishes. */
export function estimateTradeMarketDetailFieldRects(
  viewport: { width: number; height: number },
  heroRect: TradeMarketMorphRect | null,
  fields: { hasPrice: boolean; hasTitle: boolean; hasLocation: boolean }
): TradeMarketMorphFieldRects {
  const block = estimateTradeMarketDetailContentRect(viewport, heroRect);
  let y = block.y;
  const priceRect = fields.hasPrice
    ? { x: block.x, y, width: block.width, height: 28 }
    : null;
  if (priceRect) y += 32;
  const titleRect = fields.hasTitle
    ? { x: block.x, y, width: block.width, height: 24 }
    : null;
  if (titleRect) y += 28;
  const locationRect = fields.hasLocation
    ? { x: block.x, y, width: block.width, height: 18 }
    : null;
  return { priceRect, titleRect, locationRect };
}

export function measureTradeMarketListMorphFields(cardEl: HTMLElement | null): TradeMarketMorphFieldRects {
  if (!cardEl || typeof cardEl.querySelector !== "function") {
    return { priceRect: null, titleRect: null, locationRect: null };
  }
  return {
    priceRect: readTradeMarketMorphRect(cardEl.querySelector('[data-ui4-slot="price"]')),
    titleRect: readTradeMarketMorphRect(cardEl.querySelector('[data-ui4-slot="title"]')),
    locationRect: readTradeMarketMorphRect(cardEl.querySelector('[data-ui4-slot="location"]')),
  };
}

export function measureTradeMarketDetailMorphTargets(root: HTMLElement | null): {
  heroRect: TradeMarketMorphRect | null;
  contentRect: TradeMarketMorphRect | null;
  fields: TradeMarketMorphFieldRects;
} {
  if (!root) {
    return {
      heroRect: null,
      contentRect: null,
      fields: { priceRect: null, titleRect: null, locationRect: null },
    };
  }
  const photos = root.querySelector<HTMLElement>('[data-ui5-slot="photos"]');
  const price = root.querySelector<HTMLElement>('[data-ui5-slot="price"]');
  const title = root.querySelector<HTMLElement>('[data-ui5-slot="title"]');
  const location = root.querySelector<HTMLElement>('[data-ui5-slot="location"]');
  const fields: TradeMarketMorphFieldRects = {
    priceRect: readTradeMarketMorphRect(price),
    titleRect: readTradeMarketMorphRect(title),
    locationRect: readTradeMarketMorphRect(location),
  };
  const heroRect = readTradeMarketMorphRect(photos);
  const contentRect = unionRects(
    unionRects(fields.priceRect, fields.titleRect),
    fields.locationRect
  );
  return { heroRect, contentRect, fields };
}

/** Reject field geometry that sits inside/over the hero — that creates text-on-image mid-morph. */
export function fieldRectBelowHero(
  field: TradeMarketMorphRect | null,
  hero: TradeMarketMorphRect | null
): TradeMarketMorphRect | null {
  if (!field) return null;
  if (!hero) return field;
  if (field.y + 2 < hero.y + hero.height) return null;
  return field;
}

export function sanitizeTradeMarketDetailFieldRects(
  hero: TradeMarketMorphRect | null,
  fields: TradeMarketMorphFieldRects | null | undefined,
  viewport: { width: number; height: number },
  has: { hasPrice: boolean; hasTitle: boolean; hasLocation: boolean }
): TradeMarketMorphFieldRects {
  const priceRect = fieldRectBelowHero(fields?.priceRect ?? null, hero);
  const titleRect = fieldRectBelowHero(fields?.titleRect ?? null, hero);
  const locationRect = fieldRectBelowHero(fields?.locationRect ?? null, hero);
  if (priceRect && titleRect && (!has.hasLocation || locationRect)) {
    return { priceRect, titleRect, locationRect };
  }
  const estimated = estimateTradeMarketDetailFieldRects(viewport, hero, has);
  return {
    priceRect: priceRect ?? estimated.priceRect,
    titleRect: titleRect ?? estimated.titleRect,
    locationRect: locationRect ?? estimated.locationRect,
  };
}

/**
 * Live target geometry while covered.
 * Silent patch (no notify) so the running single-p composition can adopt end rects
 * without remounting / restarting the clock.
 */
export function publishTradeMarketMorphTargetGeometry(input: {
  listingId: string;
  heroRect: TradeMarketMorphRect | null;
  contentRect: TradeMarketMorphRect | null;
  fields?: TradeMarketMorphFieldRects | null;
}): void {
  const session = peekTradeMarketCardMorph();
  if (!session || session.listingId !== input.listingId.trim()) return;
  if (session.direction !== "forward") return;

  // Prefer estimated hero until live photos have a plausible size (gallery may still be empty).
  let hero = input.heroRect ?? session.targetHeroRect;
  const estimatedHero = session.targetHeroRect;
  if (
    hero &&
    estimatedHero &&
    estimatedHero.height > 48 &&
    hero.height < estimatedHero.height * 0.55
  ) {
    hero = estimatedHero;
  }

  const sanitized = sanitizeTradeMarketDetailFieldRects(hero, input.fields, session.viewport, {
    hasPrice: Boolean(session.priceText),
    hasTitle: Boolean(session.titleText),
    hasLocation: Boolean(session.locationText),
  });
  const content =
    input.contentRect && hero && input.contentRect.y + 2 >= hero.y + hero.height
      ? input.contentRect
      : estimateTradeMarketDetailContentRect(session.viewport, hero);

  memory = {
    ...session,
    targetHeroRect: hero ?? session.targetHeroRect,
    targetContentRect: content ?? session.targetContentRect,
    targetPriceRect: sanitized.priceRect,
    targetTitleRect: sanitized.titleRect,
    targetLocationRect: sanitized.locationRect,
  };
  writeStorage(memory);
}

/** Keep a reverse-ready snapshot while detail is visible (system back). */
export function publishTradeMarketDetailStandingSnapshot(input: {
  listingId: string;
  rootEl: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
}): void {
  if (prefersReducedMotion()) {
    detailStandingSnapshot = null;
    return;
  }
  const root = input.rootEl;
  if (!root) return;
  const cardRect = readTradeMarketMorphRect(root);
  if (!cardRect) return;
  const measured = measureTradeMarketDetailMorphTargets(root);
  const vp = viewportSize();
  detailStandingSnapshot = {
    listingId: input.listingId.trim(),
    generation: 0,
    direction: "back",
    cardRect,
    thumbRect: measured.heroRect,
    contentRect: measured.contentRect,
    priceRect: measured.fields.priceRect,
    titleRect: measured.fields.titleRect,
    locationRect: measured.fields.locationRect,
    targetHeroRect: null,
    targetContentRect: null,
    targetPriceRect: null,
    targetTitleRect: null,
    targetLocationRect: null,
    viewport: vp,
    imageUrl: typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null,
    priceText: (input.priceText ?? "").trim(),
    titleText: (input.titleText ?? "").trim(),
    locationText: (input.locationText ?? "").trim(),
    listRouteKey: input.listRouteKey?.trim() || null,
    capturedAt: Date.now(),
  };
}

export function clearTradeMarketDetailStandingSnapshot(): void {
  detailStandingSnapshot = null;
}

export function peekTradeMarketDetailStandingSnapshot(): TradeMarketCardMorphSession | null {
  return detailStandingSnapshot && isFresh(detailStandingSnapshot) ? detailStandingSnapshot : null;
}

/**
 * Arm forward morph on intentional list card Link click.
 * Never preventDefault / router.push.
 */
export function armTradeMarketCardMorphForward(input: {
  listingId: string;
  cardEl: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
}): TradeMarketCardMorphSession | null {
  if (prefersReducedMotion()) {
    clearTradeMarketCardMorph();
    return null;
  }
  const listingId = input.listingId.trim();
  const el = input.cardEl;
  if (!listingId || !el) {
    clearTradeMarketCardMorph();
    return null;
  }
  const cardRect = readTradeMarketMorphRect(el);
  if (!cardRect) {
    clearTradeMarketCardMorph();
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
  const existing = peekTradeMarketCardMorph();
  if (
    existing &&
    existing.direction === "forward" &&
    existing.listingId === listingId &&
    Date.now() - existing.capturedAt < 500
  ) {
    return existing;
  }
  generationSeq += 1;
  const imageUrl =
    typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  const thumbRect = readTradeMarketMorphRect(thumbEl);
  const contentRect = readTradeMarketMorphRect(metaEl);
  const listFields = measureTradeMarketListMorphFields(el);
  const priceText = (input.priceText ?? "").trim();
  const titleText = (input.titleText ?? "").trim();
  const locationText = (input.locationText ?? "").trim();
  const vp = viewportSize();
  const targetHeroRect = estimateTradeMarketDetailHeroRect(vp, thumbRect, Boolean(imageUrl));
  const targetContentRect = estimateTradeMarketDetailContentRect(vp, targetHeroRect);
  const targetFields = estimateTradeMarketDetailFieldRects(vp, targetHeroRect, {
    hasPrice: Boolean(priceText),
    hasTitle: Boolean(titleText),
    hasLocation: Boolean(locationText),
  });
  const session: TradeMarketCardMorphSession = {
    listingId,
    generation: generationSeq,
    direction: "forward",
    cardRect,
    thumbRect,
    contentRect,
    priceRect: listFields.priceRect,
    titleRect: listFields.titleRect,
    locationRect: listFields.locationRect,
    targetHeroRect,
    targetContentRect,
    targetPriceRect: targetFields.priceRect,
    targetTitleRect: targetFields.titleRect,
    targetLocationRect: targetFields.locationRect,
    viewport: vp,
    imageUrl,
    priceText,
    titleText,
    locationText,
    listRouteKey: input.listRouteKey?.trim() || null,
    capturedAt: Date.now(),
  };
  lastListGeometryById.set(listingId, {
    cardRect,
    thumbRect,
    contentRect,
    priceRect: listFields.priceRect,
    titleRect: listFields.titleRect,
    locationRect: listFields.locationRect,
    listRouteKey: session.listRouteKey,
  });
  scrollRestoreDeferred = false;
  deferredScrollRouteKey = null;
  setSession(session);
  return session;
}

/**
 * Arm reverse morph before leaving detail (header back Link) or from standing snapshot (popstate).
 */
export function armTradeMarketCardMorphBack(input: {
  listingId: string;
  rootEl?: HTMLElement | null;
  imageUrl?: string | null;
  priceText?: string | null;
  titleText?: string | null;
  locationText?: string | null;
  listRouteKey?: string | null;
  /** List card rect to return to — captured earlier or estimated. */
  listCardRect?: TradeMarketMorphRect | null;
  listThumbRect?: TradeMarketMorphRect | null;
  listContentRect?: TradeMarketMorphRect | null;
}): TradeMarketCardMorphSession | null {
  if (prefersReducedMotion()) {
    clearTradeMarketCardMorph();
    return null;
  }
  const listingId = input.listingId.trim();
  if (!listingId) return null;

  let source = input.rootEl
    ? (() => {
        const cardRect = readTradeMarketMorphRect(input.rootEl);
        if (!cardRect) return null;
        const measured = measureTradeMarketDetailMorphTargets(input.rootEl);
        return {
          cardRect,
          thumbRect: measured.heroRect,
          contentRect: measured.contentRect,
          priceRect: measured.fields.priceRect,
          titleRect: measured.fields.titleRect,
          locationRect: measured.fields.locationRect,
        };
      })()
    : null;

  if (!source && detailStandingSnapshot && detailStandingSnapshot.listingId === listingId) {
    source = {
      cardRect: detailStandingSnapshot.cardRect,
      thumbRect: detailStandingSnapshot.thumbRect,
      contentRect: detailStandingSnapshot.contentRect,
      priceRect: detailStandingSnapshot.priceRect,
      titleRect: detailStandingSnapshot.titleRect,
      locationRect: detailStandingSnapshot.locationRect,
    };
  }
  if (!source) return null;

  const vp = viewportSize();
  const saved = lastListGeometryById.get(listingId);
  const listCard =
    input.listCardRect ??
    saved?.cardRect ??
    ({
      x: Math.round(vp.width * 0.04),
      y: Math.round(vp.height * 0.28),
      width: Math.round(vp.width * 0.44),
      height: Math.round(vp.width * 0.44 + 72),
    } satisfies TradeMarketMorphRect);
  const hasImage = Boolean(
    (typeof input.imageUrl === "string" && input.imageUrl.trim()) ||
      detailStandingSnapshot?.imageUrl
  );
  const listThumb =
    input.listThumbRect ??
    saved?.thumbRect ??
    (hasImage
      ? {
          x: listCard.x,
          y: listCard.y,
          width: listCard.width,
          height: listCard.width,
        }
      : null);
  const listContent =
    input.listContentRect ??
    saved?.contentRect ??
    ({
      x: listCard.x,
      y: listCard.y + (listThumb?.height ?? 0) + 6,
      width: listCard.width,
      height: 64,
    } satisfies TradeMarketMorphRect);

  const priceText = (input.priceText ?? detailStandingSnapshot?.priceText ?? "").trim();
  const titleText = (input.titleText ?? detailStandingSnapshot?.titleText ?? "").trim();
  const locationText = (input.locationText ?? detailStandingSnapshot?.locationText ?? "").trim();
  const listFieldsEstimated = estimateTradeMarketDetailFieldRects(vp, listThumb, {
    hasPrice: Boolean(priceText),
    hasTitle: Boolean(titleText),
    hasLocation: Boolean(locationText),
  });
  // For back: target = list. Prefer saved list field rects over stack estimate.
  const targetPriceRect = saved?.priceRect ?? listFieldsEstimated.priceRect;
  const targetTitleRect = saved?.titleRect ?? listFieldsEstimated.titleRect;
  const targetLocationRect = saved?.locationRect ?? listFieldsEstimated.locationRect;

  generationSeq += 1;
  const session: TradeMarketCardMorphSession = {
    listingId,
    generation: generationSeq,
    direction: "back",
    cardRect: source.cardRect,
    thumbRect: source.thumbRect,
    contentRect: source.contentRect,
    priceRect: source.priceRect,
    titleRect: source.titleRect,
    locationRect: source.locationRect,
    targetHeroRect: listThumb,
    targetContentRect: listContent,
    targetPriceRect,
    targetTitleRect,
    targetLocationRect,
    viewport: vp,
    imageUrl:
      (typeof input.imageUrl === "string" && input.imageUrl.trim()
        ? input.imageUrl.trim()
        : null) ||
      detailStandingSnapshot?.imageUrl ||
      null,
    priceText,
    titleText,
    locationText,
    listRouteKey:
      input.listRouteKey?.trim() ||
      detailStandingSnapshot?.listRouteKey ||
      null,
    capturedAt: Date.now(),
  };

  if (session.listRouteKey) {
    scrollRestoreDeferred = true;
    deferredScrollRouteKey = session.listRouteKey;
  }
  setSession(session);
  return session;
}

/** Try arm reverse from standing snapshot when route leaves detail → list. */
export function armTradeMarketCardMorphBackFromStandingIfNeeded(input: {
  fromPostId: string;
  listRouteKey?: string | null;
}): TradeMarketCardMorphSession | null {
  const standing = peekTradeMarketDetailStandingSnapshot();
  if (!standing || standing.listingId !== input.fromPostId.trim()) return null;
  if (peekTradeMarketCardMorph()?.direction === "back") return peekTradeMarketCardMorph();
  return armTradeMarketCardMorphBack({
    listingId: standing.listingId,
    imageUrl: standing.imageUrl,
    priceText: standing.priceText,
    titleText: standing.titleText,
    locationText: standing.locationText,
    listRouteKey: input.listRouteKey ?? standing.listRouteKey,
  });
}

export function shouldDeferTradeMarketListScrollRestore(routeKey: string): boolean {
  if (!scrollRestoreDeferred) return false;
  if (deferredScrollRouteKey && deferredScrollRouteKey !== routeKey) return false;
  return isTradeMarketCardMorphActive();
}

export function takeDeferredTradeMarketListScrollRouteKey(): string | null {
  if (!scrollRestoreDeferred) return null;
  const key = deferredScrollRouteKey;
  scrollRestoreDeferred = false;
  deferredScrollRouteKey = null;
  return key;
}

export function markTradeMarketListScrollRestoreDeferred(routeKey: string): void {
  scrollRestoreDeferred = true;
  deferredScrollRouteKey = routeKey;
}
