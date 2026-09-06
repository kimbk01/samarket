"use client";

import type { ReactNode } from "react";
import { useOwnerMobileStackViewportLock } from "@/lib/business/use-owner-mobile-stack-viewport-lock";
import {
  OWNER_STACK_SHELL_ROOT_ATTR,
  OWNER_STACK_SHELL_ROOT_CLASS,
} from "@/lib/business/owner-compact-shell-layout";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";

/**
 * `/stores/owner/apply` — same ONE `.owner-stack-shell` height root as BusinessAdminShell.
 * Scroll via OwnerAdminPageScrollShell only (no private nested 100dvh).
 */
export function StoresOwnerApplyShell({ children }: { children: ReactNode }) {
  useOwnerMobileStackViewportLock(true);
  return (
    <div
      data-biz="1"
      {...{ [OWNER_STACK_SHELL_ROOT_ATTR]: "1" }}
      className={`${OWNER_STACK_SHELL_ROOT_CLASS} flex min-w-0 w-full flex-col overflow-hidden bg-[var(--biz-app-bg)]`}
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false}>{children}</OwnerAdminPageScrollShell>
    </div>
  );
}
