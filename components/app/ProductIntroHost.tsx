/**
 * @deprecated CASE B — Web no longer paints First Entry.
 * Native owns the single application-owned FE surface.
 * Kept as a null stub so stray imports fail closed without a second visual stage.
 */
"use client";

import type { ReactElement } from "react";

export function ProductIntroHost(): ReactElement | null {
  return null;
}
