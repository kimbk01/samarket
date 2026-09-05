"use client";

import type { ReactNode } from "react";

/**
 * Marks a page as adopting ARO-OPS-UX-001-W1 shared management contract.
 */
export function AdminManagementSurfaceRoot(props: {
  children: ReactNode;
  className?: string;
  proofSurface?: string;
}) {
  return (
    <div
      className={props.className}
      data-aro-ops-ux-001-w1="1"
      data-admin-mgmt-proof={props.proofSurface ?? undefined}
    >
      {props.children}
    </div>
  );
}
