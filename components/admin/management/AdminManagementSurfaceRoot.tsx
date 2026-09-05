"use client";

import type { ReactNode } from "react";

/**
 * Marks a page as adopting ARO-OPS-UX-001-W1 shared management contract.
 */
export function AdminManagementSurfaceRoot(props: {
  children: ReactNode;
  className?: string;
  proofSurface?: string;
  /** Optional wave marker (e.g. members migration). */
  wave?: "w1" | "w2" | "w3";
}) {
  return (
    <div
      className={props.className}
      data-aro-ops-ux-001-w1="1"
      data-aro-ops-ux-001-w2={props.wave === "w2" ? "1" : undefined}
      data-aro-ops-ux-001-w3={props.wave === "w3" ? "1" : undefined}
      data-admin-mgmt-proof={props.proofSurface ?? undefined}
    >
      {props.children}
    </div>
  );
}
