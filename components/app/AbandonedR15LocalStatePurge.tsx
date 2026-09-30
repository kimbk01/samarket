"use client";

import { useEffect } from "react";
import { purgeAbandonedR15LocalState } from "@/lib/startup/purge-abandoned-r15-local-state";

/**
 * Runs abandoned-R15 local state purge once per mount.
 * Presentation/board/generation logic is intentionally absent.
 */
export function AbandonedR15LocalStatePurge() {
  useEffect(() => {
    void purgeAbandonedR15LocalState();
  }, []);
  return null;
}
