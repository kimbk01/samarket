/**
 * Owner overlay body-lock ladder — ONE acquire/release owner for drawer / preview / future chrome overlays.
 * Tier1 notification inbox still uses overflow-hidden class; callers should acquire this lock
 * when opening exclusive Owner overlays so unlock is refcounted.
 */

export type OwnerOverlayBodyLockKind = "ops_drawer" | "store_preview" | "order_overlay" | "generic";

type LockEntry = {
  kind: OwnerOverlayBodyLockKind;
  scrollY: number;
};

const stack: LockEntry[] = [];
let applied = false;

function applyBodyFixed(scrollY: number): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  applied = true;
}

function clearBodyFixed(restoreY: number): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = "";
  body.style.overflow = "";
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  applied = false;
  requestAnimationFrame(() => {
    window.scrollTo(0, restoreY);
  });
}

/** Acquire exclusive body lock. Returns release fn (idempotent). */
export function acquireOwnerOverlayBodyLock(kind: OwnerOverlayBodyLockKind): () => void {
  const scrollY =
    typeof window !== "undefined"
      ? window.scrollY || document.documentElement.scrollTop || 0
      : 0;
  const entry: LockEntry = { kind, scrollY };
  stack.push(entry);
  if (typeof document !== "undefined" && !applied) {
    applyBodyFixed(scrollY);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const idx = stack.lastIndexOf(entry);
    if (idx >= 0) stack.splice(idx, 1);
    if (stack.length === 0) {
      if (typeof document !== "undefined") {
        clearBodyFixed(entry.scrollY);
      } else {
        applied = false;
      }
    }
  };
}

export function getOwnerOverlayBodyLockDepth(): number {
  return stack.length;
}

export function peekOwnerOverlayBodyLockKind(): OwnerOverlayBodyLockKind | null {
  return stack.length > 0 ? stack[stack.length - 1]!.kind : null;
}
